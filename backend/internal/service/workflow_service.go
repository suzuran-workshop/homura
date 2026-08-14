package service

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/repository"
)

// --- Workflow definition structures (decoded from JSONB) ---

// WorkflowDef is the human-authored blueprint stored as JSONB in WorkflowDefinition.Definition.
type WorkflowDef struct {
	Name      string                  `json:"name"`
	Variables map[string]string       `json:"variables"` // var name -> "number"|"string"
	Steps     []WorkflowStep          `json:"steps"`
}

type WorkflowStep struct {
	Name       string         `json:"name"`
	Type       string         `json:"type"` // start/approval/condition/end
	Next       string         `json:"next,omitempty"`
	Assignee   *AssigneeSpec  `json:"assignee,omitempty"`
	OnApprove  *GotoSpec      `json:"on_approve,omitempty"`
	OnReject   *GotoSpec      `json:"on_reject,omitempty"`
	Conditions []ConditionSpec `json:"conditions,omitempty"`
	Result     string         `json:"result,omitempty"` // for end steps
}

type AssigneeSpec struct {
	Type  string `json:"type"`  // user / role
	Value string `json:"value"` // user_id as string, or role name
}

type GotoSpec struct {
	Goto string `json:"goto"`
}

type ConditionSpec struct {
	When      string `json:"when,omitempty"`
	Goto      string `json:"goto,omitempty"`
	Otherwise string `json:"otherwise,omitempty"`
}

// --- Service ---

type WorkflowService struct {
	defRepo  *repository.WorkflowDefinitionRepository
	instRepo *repository.WorkflowInstanceRepository
	taskRepo *repository.WorkflowTaskRepository
	bondRepo *repository.OrgUserBondRepository
	notifier *NotificationService
}

func NewWorkflowService(
	def *repository.WorkflowDefinitionRepository,
	inst *repository.WorkflowInstanceRepository,
	task *repository.WorkflowTaskRepository,
	bond *repository.OrgUserBondRepository,
	notifier *NotificationService,
) *WorkflowService {
	return &WorkflowService{defRepo: def, instRepo: inst, taskRepo: task, bondRepo: bond, notifier: notifier}
}

// --- Definition operations ---

// DefineWorkflow creates a new workflow definition after validating it.
func (s *WorkflowService) DefineWorkflow(ctx context.Context, orgID, createdBy int, name, description string, defJSON map[string]interface{}) (*model.WorkflowDefinition, error) {
	wf, err := decodeDefinition(defJSON)
	if err != nil {
		return nil, fmt.Errorf("invalid workflow definition: %w", err)
	}
	if err := validateDefinition(wf); err != nil {
		return nil, err
	}

	d := &model.WorkflowDefinition{
		OrgID:       orgID,
		Name:        name,
		Description: description,
		Definition:  model.JSONB(defJSON),
		Version:     1,
		Status:      "active",
		CreatedBy:   createdBy,
	}
	if err := s.defRepo.Create(ctx, d); err != nil {
		return nil, fmt.Errorf("failed to create workflow definition: %w", err)
	}
	return d, nil
}

// GetDefinition returns a single definition.
func (s *WorkflowService) GetDefinition(ctx context.Context, orgID, id int) (*model.WorkflowDefinition, error) {
	return s.defRepo.GetByID(ctx, orgID, id)
}

// ListDefinitions lists all definitions for an org.
func (s *WorkflowService) ListDefinitions(ctx context.Context, orgID int) ([]*model.WorkflowDefinition, error) {
	return s.defRepo.ListByOrgID(ctx, orgID)
}

// ArchiveDefinition marks a definition as archived (no new instances can start).
func (s *WorkflowService) ArchiveDefinition(ctx context.Context, orgID, id int) error {
	return s.defRepo.SetStatus(ctx, orgID, id, "archived")
}

// --- Instance operations ---

// StartInstance creates an instance and advances it to the first approval or end step.
func (s *WorkflowService) StartInstance(ctx context.Context, orgID, defID, createdBy int, variables map[string]interface{}) (*model.WorkflowInstance, error) {
	def, err := s.defRepo.GetByID(ctx, orgID, defID)
	if err != nil {
		return nil, fmt.Errorf("failed to load definition: %w", err)
	}
	if def == nil {
		return nil, fmt.Errorf("workflow definition not found: %d", defID)
	}
	if def.Status != "active" {
		return nil, fmt.Errorf("workflow definition is not active (status=%s)", def.Status)
	}

	wf, err := decodeDefinition(def.Definition)
	if err != nil {
		return nil, fmt.Errorf("corrupt workflow definition: %w", err)
	}

	start := findStep(wf, "start")
	if start == nil {
		return nil, fmt.Errorf("workflow has no start step")
	}

	inst := &model.WorkflowInstance{
		OrgID:        orgID,
		DefinitionID: defID,
		Status:       "running",
		CurrentStep:  start.Name,
		Variables:    model.JSONB(variables),
		CreatedBy:    createdBy,
	}
	if err := s.instRepo.Create(ctx, inst); err != nil {
		return nil, fmt.Errorf("failed to create instance: %w", err)
	}

	if err := s.advance(ctx, wf, inst, start.Next); err != nil {
		return nil, err
	}
	return inst, nil
}

// GetInstance returns an instance plus its task history.
func (s *WorkflowService) GetInstance(ctx context.Context, orgID, id int) (*model.WorkflowInstance, []*model.WorkflowTask, error) {
	inst, err := s.instRepo.GetByID(ctx, orgID, id)
	if err != nil {
		return nil, nil, err
	}
	if inst == nil {
		return nil, nil, nil
	}
	tasks, err := s.taskRepo.ListByInstance(ctx, orgID, id)
	if err != nil {
		return nil, nil, err
	}
	return inst, tasks, nil
}

// ListInstances lists instances for an org, optionally filtered by status.
func (s *WorkflowService) ListInstances(ctx context.Context, orgID int, status string) ([]*model.WorkflowInstance, error) {
	return s.instRepo.ListByOrgID(ctx, orgID, status)
}

// CancelInstance cancels a running instance. Only the creator or an org admin may cancel.
func (s *WorkflowService) CancelInstance(ctx context.Context, orgID, id, userID int, isAdmin bool) error {
	inst, err := s.instRepo.GetByID(ctx, orgID, id)
	if err != nil {
		return err
	}
	if inst == nil {
		return fmt.Errorf("instance not found: %d", id)
	}
	if inst.Status != "running" {
		return fmt.Errorf("cannot cancel instance in status %s", inst.Status)
	}
	if !isAdmin && inst.CreatedBy != userID {
		return fmt.Errorf("only the creator or an org admin may cancel this instance")
	}
	now := time.Now()
	inst.Status = "cancelled"
	inst.CompletedAt = &now
	return s.instRepo.Update(ctx, inst)
}

// ListTasks lists tasks for a user (optionally filtered by status).
func (s *WorkflowService) ListTasks(ctx context.Context, userID int, status string) ([]*model.WorkflowTask, error) {
	return s.taskRepo.ListByAssignee(ctx, userID, status)
}

// --- Task actions ---

// ApproveTask approves a pending task and advances the instance.
func (s *WorkflowService) ApproveTask(ctx context.Context, orgID, taskID, userID int, comment string) (*model.WorkflowInstance, error) {
	return s.actOnTask(ctx, orgID, taskID, userID, comment, "approved")
}

// RejectTask rejects a pending task and routes the instance along its reject branch.
func (s *WorkflowService) RejectTask(ctx context.Context, orgID, taskID, userID int, comment string) (*model.WorkflowInstance, error) {
	return s.actOnTask(ctx, orgID, taskID, userID, comment, "rejected")
}

func (s *WorkflowService) actOnTask(ctx context.Context, orgID, taskID, userID int, comment, decision string) (*model.WorkflowInstance, error) {
	task, err := s.taskRepo.GetByID(ctx, orgID, taskID)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, fmt.Errorf("task not found: %d", taskID)
	}
	if task.Status != "pending" {
		return nil, fmt.Errorf("task already acted upon (status=%s)", task.Status)
	}
	if task.AssigneeID != userID {
		return nil, fmt.Errorf("task is not assigned to this user")
	}

	now := time.Now()
	task.Status = decision
	task.Comment = comment
	task.ActedAt = &now
	if err := s.taskRepo.Update(ctx, task); err != nil {
		return nil, err
	}

	inst, err := s.instRepo.GetByID(ctx, orgID, task.InstanceID)
	if err != nil {
		return nil, err
	}
	if inst == nil {
		return nil, fmt.Errorf("instance not found for task")
	}
	if inst.Status != "running" {
		return inst, nil // instance already resolved; nothing to do
	}

	def, err := s.defRepo.GetByID(ctx, orgID, inst.DefinitionID)
	if err != nil {
		return nil, err
	}
	wf, err := decodeDefinition(def.Definition)
	if err != nil {
		return nil, err
	}
	step := findStep(wf, task.StepName)
	if step == nil {
		return nil, fmt.Errorf("step %s not found in definition", task.StepName)
	}

	var nextStep string
	if decision == "approved" {
		if step.OnApprove == nil {
			return nil, fmt.Errorf("step %s has no on_approve branch", step.Name)
		}
		nextStep = step.OnApprove.Goto
	} else {
		if step.OnReject == nil {
			return nil, fmt.Errorf("step %s has no on_reject branch", step.Name)
		}
		nextStep = step.OnReject.Goto
	}

	if err := s.advance(ctx, wf, inst, nextStep); err != nil {
		return nil, err
	}
	return inst, nil
}

// advance moves an instance to the given step, auto-resolving start/condition/end steps
// and creating tasks for approval steps.
func (s *WorkflowService) advance(ctx context.Context, wf *WorkflowDef, inst *model.WorkflowInstance, stepName string) error {
	step := findStep(wf, stepName)
	if step == nil {
		return fmt.Errorf("step not found: %s", stepName)
	}

	switch step.Type {
	case "start":
		// Auto-advance to the next step.
		inst.CurrentStep = step.Name
		if err := s.instRepo.Update(ctx, inst); err != nil {
			return err
		}
		return s.advance(ctx, wf, inst, step.Next)

	case "condition":
		inst.CurrentStep = step.Name
		if err := s.instRepo.Update(ctx, inst); err != nil {
			return err
		}
		next, err := s.evaluateConditions(step, inst.Variables)
		if err != nil {
			return err
		}
		return s.advance(ctx, wf, inst, next)

	case "approval":
		inst.CurrentStep = step.Name
		if err := s.instRepo.Update(ctx, inst); err != nil {
			return err
		}
		return s.createApprovalTasks(ctx, step, inst)

	case "end":
		now := time.Now()
		inst.CurrentStep = step.Name
		inst.Status = step.Result
		if inst.Status == "" {
			inst.Status = "approved"
		}
		inst.CompletedAt = &now
		return s.instRepo.Update(ctx, inst)

	default:
		return fmt.Errorf("unknown step type: %s", step.Type)
	}
}

// createApprovalTasks creates one task per resolved assignee and notifies them.
func (s *WorkflowService) createApprovalTasks(ctx context.Context, step *WorkflowStep, inst *model.WorkflowInstance) error {
	if step.Assignee == nil {
		return fmt.Errorf("approval step %s has no assignee", step.Name)
	}

	var assigneeIDs []int
	switch step.Assignee.Type {
	case "user":
		id, err := strconv.Atoi(step.Assignee.Value)
		if err != nil {
			return fmt.Errorf("invalid user assignee value %q: %w", step.Assignee.Value, err)
		}
		assigneeIDs = []int{id}
	case "role":
		ids, err := s.resolveRoleAssignees(ctx, inst.OrgID, step.Assignee.Value)
		if err != nil {
			return err
		}
		assigneeIDs = ids
	default:
		return fmt.Errorf("unknown assignee type: %s", step.Assignee.Type)
	}

	for _, uid := range assigneeIDs {
		task := &model.WorkflowTask{
			OrgID:      inst.OrgID,
			InstanceID: inst.ID,
			StepName:   step.Name,
			AssigneeID: uid,
			Status:     "pending",
		}
		if err := s.taskRepo.Create(ctx, task); err != nil {
			return fmt.Errorf("failed to create task: %w", err)
		}
		if s.notifier != nil {
			// Best-effort notification; failure does not block the workflow.
			_ = s.notifier.SendApprovalNotification(ctx, uid, inst.ID, "workflow", "pending")
		}
	}
	return nil
}

// resolveRoleAssignees maps a role name to user IDs within an org.
func (s *WorkflowService) resolveRoleAssignees(ctx context.Context, orgID int, role string) ([]int, error) {
	if s.bondRepo == nil {
		return nil, fmt.Errorf("bond repository not configured")
	}
	bonds, err := s.bondRepo.GetByOrgID(ctx, orgID)
	if err != nil {
		return nil, err
	}
	var ids []int
	for _, b := range bonds {
		switch role {
		case "tenant_admin":
			if b.IsAdmin {
				ids = append(ids, b.UserID)
			}
		case "dept_manager":
			if b.IsDepartmentManager {
				ids = append(ids, b.UserID)
			}
		case "provider":
			// provider is a platform-level role not stored on the bond; skip.
		}
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("no users with role %q in org %d", role, orgID)
	}
	return ids, nil
}

// evaluateConditions evaluates a condition step's branches and returns the target step name.
func (s *WorkflowService) evaluateConditions(step *WorkflowStep, vars model.JSONB) (string, error) {
	for _, c := range step.Conditions {
		if c.When != "" {
			ok, err := EvaluateCondition(c.When, vars)
			if err != nil {
				return "", err
			}
			if ok {
				return c.Goto, nil
			}
		} else if c.Otherwise != "" {
			return c.Otherwise, nil
		}
	}
	return "", fmt.Errorf("no matching condition branch in step %s", step.Name)
}

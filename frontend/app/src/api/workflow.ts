import apiClient from './client'

export interface WorkflowDefinition {
  id: number
  orgId: number
  name: string
  description: string
  status: 'draft' | 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export interface WorkflowNode {
  id: string
  type: 'start' | 'end' | 'task' | 'condition' | 'parallel'
  name: string
  assigneeType?: 'user' | 'role' | 'department'
  assigneeId?: number
  nextNodes: string[]
  conditionExpression?: string
}

export interface WorkflowInstance {
  id: number
  definitionId: number
  definitionName: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  currentNodeId: string
  currentNodeName: string
  initiatorId: number
  initiatorName: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowTask {
  id: number
  instanceId: number
  nodeId: string
  nodeName: string
  assigneeId: number
  assigneeName: string
  status: 'pending' | 'approved' | 'rejected' | 'transferred'
  comment: string
  createdAt: string
  updatedAt: string
}

export interface CreateWorkflowRequest {
  name: string
  description: string
  nodes: WorkflowNode[]
}

export interface UpdateWorkflowRequest {
  name?: string
  description?: string
  nodes?: WorkflowNode[]
  status?: 'draft' | 'active' | 'inactive'
}

export const listWorkflowDefinitions = (orgId: number) =>
  apiClient.get<WorkflowDefinition[]>(`/api/provider/orgs/${orgId}/workflows`).then((r) => r.data)

export const getWorkflowDefinition = (orgId: number, workflowId: number) =>
  apiClient.get<WorkflowDefinition>(`/api/provider/orgs/${orgId}/workflows/${workflowId}`).then((r) => r.data)

export const createWorkflowDefinition = (orgId: number, data: CreateWorkflowRequest) =>
  apiClient.post<WorkflowDefinition>(`/api/provider/orgs/${orgId}/workflows`, data).then((r) => r.data)

export const updateWorkflowDefinition = (orgId: number, workflowId: number, data: UpdateWorkflowRequest) =>
  apiClient.put<WorkflowDefinition>(`/api/provider/orgs/${orgId}/workflows/${workflowId}`, data).then((r) => r.data)

export const deleteWorkflowDefinition = (orgId: number, workflowId: number) =>
  apiClient.delete(`/api/provider/orgs/${orgId}/workflows/${workflowId}`).then((r) => r.data)

export const listWorkflowInstances = (orgId: number, workflowId?: number) =>
  apiClient.get<WorkflowInstance[]>(`/api/provider/orgs/${orgId}/workflow-instances`, {
    params: workflowId ? { workflowId } : {},
  }).then((r) => r.data)

export const getWorkflowInstance = (orgId: number, instanceId: number) =>
  apiClient.get<WorkflowInstance>(`/api/provider/orgs/${orgId}/workflow-instances/${instanceId}`).then((r) => r.data)

export const startWorkflowInstance = (orgId: number, workflowId: number, initialData?: any) =>
  apiClient.post<WorkflowInstance>(`/api/provider/orgs/${orgId}/workflows/${workflowId}/instances`, { initialData }).then((r) => r.data)

export const cancelWorkflowInstance = (orgId: number, instanceId: number) =>
  apiClient.post(`/api/provider/orgs/${orgId}/workflow-instances/${instanceId}/cancel`).then((r) => r.data)

export const listMyTasks = (orgId: number) =>
  apiClient.get<WorkflowTask[]>(`/api/provider/orgs/${orgId}/workflow-tasks/my`).then((r) => r.data)

export const getWorkflowTask = (orgId: number, taskId: number) =>
  apiClient.get<WorkflowTask>(`/api/provider/orgs/${orgId}/workflow-tasks/${taskId}`).then((r) => r.data)

export const approveWorkflowTask = (orgId: number, taskId: number, comment?: string) =>
  apiClient.post(`/api/provider/orgs/${orgId}/workflow-tasks/${taskId}/approve`, { comment }).then((r) => r.data)

export const rejectWorkflowTask = (orgId: number, taskId: number, comment: string) =>
  apiClient.post(`/api/provider/orgs/${orgId}/workflow-tasks/${taskId}/reject`, { comment }).then((r) => r.data)

export const transferWorkflowTask = (orgId: number, taskId: number, targetUserId: number, comment?: string) =>
  apiClient.post(`/api/provider/orgs/${orgId}/workflow-tasks/${taskId}/transfer`, { targetUserId, comment }).then((r) => r.data)

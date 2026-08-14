package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/xrl/suzuran-cloud/internal/handler"
	"github.com/xrl/suzuran-cloud/internal/handler/provider"
	"github.com/xrl/suzuran-cloud/internal/handler/tenant"
	"github.com/xrl/suzuran-cloud/internal/mcp"
	mcptools "github.com/xrl/suzuran-cloud/internal/mcp/tools"
	"github.com/xrl/suzuran-cloud/internal/middleware"
	"github.com/xrl/suzuran-cloud/internal/model"
	"github.com/xrl/suzuran-cloud/internal/oauth"
	"github.com/xrl/suzuran-cloud/internal/pkg/dingtalk"
	pkgredis "github.com/xrl/suzuran-cloud/internal/pkg/redis"
	"github.com/xrl/suzuran-cloud/internal/repository"
	"github.com/xrl/suzuran-cloud/internal/runtime"
	"github.com/xrl/suzuran-cloud/internal/service"
	"github.com/xrl/suzuran-cloud/internal/storage"
)

func main() {
	// Initialize database
	db, err := initDatabase()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Initialize repositories (multi-tenant core only)
	orgRepo := repository.NewOrgRepository(db)
	userRepo := repository.NewUserRepository(db)
	bondRepo := repository.NewOrgUserBondRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	credRepo := repository.NewWebAuthnCredentialRepository(db)
	clientRepo := repository.NewOAuthClientRepository(db)
	tokenRepo := repository.NewOAuthTokenRepository(db)
	sessionRepo := repository.NewOAuthSessionRepository(db)

	// Initialize MinIO client
	minioClient, err := storage.NewMinIOClient(
		os.Getenv("MINIO_ENDPOINT"),
		os.Getenv("MINIO_ACCESS_KEY"),
		os.Getenv("MINIO_SECRET_KEY"),
		getEnvOrDefault("MINIO_BUCKET", "suzuran-files"),
	)
	if err != nil {
		log.Printf("Warning: Failed to initialize MinIO: %v", err)
	}

	// Load OAuth IdP config
	oauthCfg := oauth.LoadConfig()

	// Initialize services
	orgService := service.NewOrgService(orgRepo, deptRepo, bondRepo)
	deptService := service.NewDepartmentService(deptRepo, bondRepo)
	userService := service.NewUserService(userRepo, bondRepo)

	webAuthnSvc, err := oauth.NewWebAuthnService(oauthCfg, userRepo, credRepo, bondRepo, orgRepo)
	if err != nil {
		log.Fatalf("Failed to init WebAuthn service: %v", err)
	}
	dingTalkSvc := oauth.NewDingTalkService(oauthCfg, userRepo, bondRepo, orgRepo)
	oauthSvc := oauth.NewOAuthService(oauthCfg, tokenRepo, sessionRepo, clientRepo, userRepo, bondRepo, orgRepo)

	// Initialize handlers with dependency injection
	oauthHandler := oauth.NewHandler(webAuthnSvc, dingTalkSvc, oauthSvc)
	orgHandler := provider.NewOrgHandler(orgService)
	orgMemberHandler := provider.NewOrgMemberHandler(deptService, userService)
	deptHandler := tenant.NewDepartmentHandler(deptService, userService)
	userHandler := tenant.NewUserHandler(userService)
	fileHandler := handler.NewFileHandler(minioClient)
	systemHandler := handler.NewSystemHandler(db)
	logHandler := handler.NewLogHandler("logs/app.log", 1000)

	// Initialize application runtime (Docker)
	appRepo := repository.NewApplicationRepository(db)
	deployRepo := repository.NewApplicationDeploymentRepository(db)
	dockerClient, err := runtime.NewDockerClient()
	if err != nil {
		log.Printf("Warning: Failed to init Docker client: %v (app runtime disabled)", err)
	}
	var runtimeManager *runtime.RuntimeManager
	var appService *service.ApplicationService
	if dockerClient != nil {
		runtimeManager = runtime.NewRuntimeManager(dockerClient, appRepo, deployRepo)
		appService = service.NewApplicationService(appRepo, deployRepo, runtimeManager)
	}
	appHandler := provider.NewAppHandler(appService)

	// Audit log query handler (for MCP call log viewer + general audit)
	auditSvc := service.NewAuditService(db)
	auditHandler := provider.NewAuditHandler(auditSvc)

	// Initialize workflow engine (definition / instance / task repositories + service)
	wfDefRepo := repository.NewWorkflowDefinitionRepository(db)
	wfInstRepo := repository.NewWorkflowInstanceRepository(db)
	wfTaskRepo := repository.NewWorkflowTaskRepository(db)
	var notificationSvc *service.NotificationService // in-app channel not yet wired; notifications are no-op until configured
	workflowSvc := service.NewWorkflowService(wfDefRepo, wfInstRepo, wfTaskRepo, bondRepo, notificationSvc)

	// Initialize data service for app-owned tables
	dataRepo := repository.NewDataRepository(db)
	dataSvc := service.NewDataService(dataRepo)

	// Initialize DingTalk sync service (only when configured)
	var syncHandler *provider.DingTalkSyncHandler
	if dtCfg := dingtalk.NewConfig(); dtCfg.AppKey != "" {
		syncLogRepo := repository.NewDingTalkSyncLogRepository(db)
		dtClient := dingtalk.NewClient(dtCfg)
		syncService := service.NewDingTalkSyncService(dtClient, orgRepo, userRepo, deptRepo, bondRepo, syncLogRepo)
		syncHandler = provider.NewDingTalkSyncHandler(syncService)
	} else {
		log.Printf("Warning: DINGTALK_APP_KEY not set, org sync disabled")
	}

	// Initialize MCP server
	mcpServer := mcp.NewMCPServer()

	// Initialize Redis client for MCP rate limiting (nil-safe — rate limiter is skipped when nil)
	var mcpRateLimiter *mcp.RateLimiter
	if err := pkgredis.InitClient(); err != nil {
		log.Printf("Warning: Redis unavailable (%v), MCP rate limiting disabled", err)
	} else {
		mcpRateLimiter = mcp.NewDefaultRateLimiter(pkgredis.Client)
	}

	mcptools.RegisterAllTools(
		mcpServer,
		orgService,
		userService,
		deptService,
		minioClient,
		db,
		mcpRateLimiter,
		auditSvc,
		workflowSvc,
		dataSvc,
	)
	mcpServer.RegisterPrompts()

	// Register schema resources from docs/contracts/schemas/
	schemaDir := getEnvOrDefault("SCHEMA_DIR", "../docs/contracts/schemas")
	schemas := mcp.LoadSchemaResources(schemaDir)
	mcpServer.RegisterResources(schemas)

	r := gin.Default()

	// Store server start time
	serverStartTime := time.Now().Format(time.RFC3339)

	// CORS middleware
	r.Use(middleware.CORS())

	// Logging middleware
	r.Use(func(c *gin.Context) {
		c.Set("serverStartTime", serverStartTime)
		startTime := time.Now()
		c.Next()

		entry := map[string]interface{}{
			"method":   c.Request.Method,
			"path":     c.Request.URL.Path,
			"status":   c.Writer.Status(),
			"duration": time.Since(startTime).String(),
			"ip":       c.ClientIP(),
		}

		logHandler.AddLog("info",
			fmt.Sprintf("%s %s %d %s", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(startTime)),
			entry)
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// OAuth IdP routes (public — login/registration ceremonies + OAuth2 endpoints)
	oauthGroup := r.Group("/oauth")
	{
		// WebAuthn registration
		oauthGroup.POST("/webauthn/register/begin", oauthHandler.BeginRegistration)
		oauthGroup.POST("/webauthn/register/finish", oauthHandler.FinishRegistration)

		// WebAuthn login
		oauthGroup.POST("/webauthn/login/begin", oauthHandler.BeginLogin)
		oauthGroup.POST("/webauthn/login/finish", oauthHandler.FinishLogin)

		// DingTalk OAuth
		oauthGroup.GET("/dingtalk/authorize", oauthHandler.DingTalkAuthorize)
		oauthGroup.GET("/dingtalk/callback", oauthHandler.DingTalkCallback)

		// Session token exchange (login → token bridge)
		oauthGroup.POST("/session/token", oauthHandler.SessionToken)

		// OAuth2 endpoints
		oauthGroup.GET("/authorize", oauthHandler.Authorize)
		oauthGroup.POST("/token", oauthHandler.Token)
		oauthGroup.POST("/revoke", oauthHandler.Revoke)
	}

	// OAuth2 discovery
	r.GET("/.well-known/openid-configuration", oauthHandler.Metadata)

	// Protected routes (require valid OAuth access token)
	protected := r.Group("/api")
	protected.Use(middleware.Auth())
	protected.Use(middleware.TenantContext())
	auditMW := middleware.NewAuditMiddleware(service.NewAuditService(db))
	protected.Use(auditMW.RecordOperations())
	{
		// System monitoring routes (require org_admin or provider_admin)
		systemGroup := protected.Group("/system")
		systemGroup.Use(middleware.RequireOrgAdmin())
		{
			systemGroup.GET("/metrics", systemHandler.GetSystemMetrics)
			systemGroup.GET("/database/metrics", systemHandler.GetDatabaseMetrics)
			systemGroup.GET("/logs", logHandler.GetLogs)
		}

		// Generic application list route (accessible by all authenticated users).
		// Returns apps for the caller's org — serves as the OA-style start page for
		// both providers (all apps they manage) and tenant users (apps distributed to them).
		protected.GET("/apps", func(c *gin.Context) {
			orgID := c.GetInt("org_id")
			apps, err := appRepo.ListByOrgID(c.Request.Context(), orgID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			// Mask container IDs for non-provider roles
			role := c.GetString("role")
			if role != "provider" {
				for _, a := range apps {
					a.ContainerID = ""
				}
			}
			c.JSON(http.StatusOK, gin.H{"apps": apps})
		})

		// Provider portal routes (require org_admin or provider_admin)
		providerGroup := protected.Group("/provider")
		providerGroup.Use(middleware.RequireOrgAdmin())
		{
			providerGroup.GET("/orgs", orgHandler.List)
			providerGroup.POST("/orgs", orgHandler.Create)
			providerGroup.PUT("/orgs/:orgId", orgHandler.Update)
			providerGroup.DELETE("/orgs/:orgId", orgHandler.Delete)

			// Organization department & member management
			orgDepts := providerGroup.Group("/orgs/:orgId/departments")
			{
				orgDepts.GET("", orgMemberHandler.ListDepts)
				orgDepts.GET("/tree", orgMemberHandler.DeptTree)
				orgDepts.POST("", orgMemberHandler.CreateDept)
				orgDepts.PUT("/:deptId", orgMemberHandler.UpdateDept)
				orgDepts.DELETE("/:deptId", orgMemberHandler.DeleteDept)
				orgDepts.POST("/:deptId/manager", orgMemberHandler.SetDeptManager)
			}
			orgUsers := providerGroup.Group("/orgs/:orgId/users")
			{
				orgUsers.GET("", orgMemberHandler.ListMembers)
				orgUsers.POST("", orgMemberHandler.CreateMember)
				orgUsers.PUT("/:userId", orgMemberHandler.UpdateMember)
				orgUsers.DELETE("/:userId", orgMemberHandler.RemoveMember)
			}

			// DingTalk organization sync (only mounted when configured)
			if syncHandler != nil {
				providerGroup.POST("/orgs/:orgId/dingtalk/sync", syncHandler.Sync)
			}

			// Application management routes
			if appHandler != nil {
				appGroup := providerGroup.Group("/apps")
				{
					appGroup.POST("", appHandler.Create)
					appGroup.GET("", appHandler.List)
					appGroup.GET("/:appId", appHandler.GetByID)
					appGroup.PUT("/:appId", appHandler.Update)
					appGroup.DELETE("/:appId", appHandler.Delete)
					appGroup.POST("/:appId/deploy", appHandler.Deploy)
					appGroup.POST("/:appId/start", appHandler.Start)
					appGroup.POST("/:appId/stop", appHandler.Stop)
					appGroup.POST("/:appId/restart", appHandler.Restart)
					appGroup.GET("/:appId/status", appHandler.Status)
					appGroup.GET("/:appId/logs", appHandler.Logs)
					appGroup.GET("/:appId/deployments", appHandler.Deployments)
				}
			}

			// Audit log queries (MCP call log viewer + general audit)
			providerGroup.GET("/audit/logs", auditHandler.ListLogs)
		}

		// Tenant admin routes (require dept_manager or higher)
		tenantGroup := protected.Group("/tenant")
		tenantGroup.Use(middleware.RequireDeptManager())
		{
			tenantGroup.GET("/users", userHandler.ListMembers)
			tenantGroup.POST("/users", userHandler.CreateMember)
			tenantGroup.PUT("/users/:userId", userHandler.UpdateMember)
			tenantGroup.DELETE("/users/:userId", userHandler.RemoveMember)

			// Department routes
			depts := tenantGroup.Group("/departments")
			{
				depts.GET("", deptHandler.ListDepts)
				depts.GET("/tree", deptHandler.DeptTree)
				depts.POST("", deptHandler.CreateDept)
				depts.PUT("/:deptId", deptHandler.UpdateDept)
				depts.DELETE("/:deptId", deptHandler.DeleteDept)
				depts.POST("/:deptId/manager", deptHandler.SetDeptManager)
			}

			// File upload routes
			files := tenantGroup.Group("/files")
			{
				files.POST("/upload", fileHandler.Upload)
				files.GET("/:key/download", fileHandler.Download)
				files.DELETE("/:key", fileHandler.Delete)
			}
		}
	}

	// MCP server routes (requires authentication)
	mcpGroup := r.Group("/mcp")
	mcpGroup.Use(middleware.Auth())
	mcpGroup.Use(middleware.TenantContext())
	{
		mcpGroup.POST("", mcpServer.HandleRequest)
		mcpGroup.GET("/tools", mcpServer.ListTools)
	}

	// Application request proxy routes (external → app container)
	if runtimeManager != nil {
		appRouter := runtime.NewAppRouter(appRepo, runtimeManager)
		r.Any("/apps/:appId/*path", appRouter.HandleRequest)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8888"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func initDatabase() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=admin password=changeme dbname=suzuran_cloud port=5432 sslmode=disable"
	}

	// Try PostgreSQL first
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("PostgreSQL unavailable (%v), falling back to SQLite in-memory mode", err)
		db, err = gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
		if err != nil {
			return nil, fmt.Errorf("failed to open SQLite: %w", err)
		}

		// AutoMigrate all models for SQLite
		if err := db.AutoMigrate(
			&model.User{},
			&model.Org{},
			&model.OrgUserBond{},
			&model.Department{},
			&model.WebAuthnCredential{},
			&model.OAuthClient{},
			&model.OAuthToken{},
			&model.OAuthSession{},
			&model.Application{},
			&model.ApplicationDeployment{},
			&model.AuditLog{},
			&model.DingTalkSyncLog{},
			&model.WorkflowDefinition{},
			&model.WorkflowInstance{},
			&model.WorkflowTask{},
			&model.DataTable{},
		); err != nil {
			return nil, fmt.Errorf("failed to auto-migrate: %w", err)
		}
		log.Println("SQLite in-memory database initialized with auto-migration")
	}

	return db, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

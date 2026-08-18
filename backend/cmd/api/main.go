package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/xrl/suzuran-cloud/internal/handler"
	"github.com/xrl/suzuran-cloud/internal/handler/provider"
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

// loadEnvFile reads .env file and sets environment variables.
// This must be called before any service initialization.
func loadEnvFile() {
	envFile := ".env"

	// Try to find .env relative to executable
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		envFile = filepath.Join(exeDir, ".env")
	}

	file, err := os.Open(envFile)
	if err != nil {
		log.Printf("Warning: Could not open .env file: %v", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Parse KEY=VALUE
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			// Remove quotes if present
			value = strings.Trim(value, `"'`)
			os.Setenv(key, value)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Warning: Error reading .env file: %v", err)
	} else {
		log.Println("Loaded environment from .env file")
	}
}

func main() {
	// Load environment variables from .env file (must be first)
	loadEnvFile()

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
	passwordSvc := oauth.NewPasswordService(userRepo, bondRepo, orgRepo)

	// Initialize handlers with dependency injection
	oauthHandler := oauth.NewHandler(webAuthnSvc, dingTalkSvc, oauthSvc, passwordSvc)
	orgHandler := provider.NewOrgHandler(orgService)
	orgMemberHandler := provider.NewOrgMemberHandler(deptService, userService)
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
	if dockerClient != nil {
		runtimeManager = runtime.NewRuntimeManager(dockerClient, appRepo, deployRepo, minioClient)
	}
	appService := service.NewApplicationService(appRepo, deployRepo, runtimeManager, minioClient)
	appHandler := provider.NewAppHandler(appService)
	distService := service.NewDistributionService(appRepo, orgRepo, userRepo, bondRepo)
	distHandler := provider.NewDistributionHandler(distService)

	// Data management (app admins + providers; auth enforced in-handler)
	dataRepo := repository.NewDataRepository(db)
	dataSvc := service.NewDataService(dataRepo)
	dataHandler := handler.NewDataHandler(dataSvc, distService)

	// Audit log query handler (for MCP call log viewer + general audit)
	auditSvc := service.NewAuditService(db)
	auditHandler := provider.NewAuditHandler(auditSvc)

	// Initialize workflow engine (definition / instance / task repositories + service)
	wfDefRepo := repository.NewWorkflowDefinitionRepository(db)
	wfInstRepo := repository.NewWorkflowInstanceRepository(db)
	wfTaskRepo := repository.NewWorkflowTaskRepository(db)
	var notificationSvc *service.NotificationService // in-app channel not yet wired; notifications are no-op until configured
	workflowSvc := service.NewWorkflowService(wfDefRepo, wfInstRepo, wfTaskRepo, bondRepo, notificationSvc)

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
		appService,
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

	// OOBE endpoints (Out-of-Box Experience — system initialization)
	oobeHandler := handler.NewOOBEHandler(db)
	r.GET("/oobe/status", oobeHandler.Status)
	r.POST("/oobe/setup", oobeHandler.Setup)

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

		// Password login (primary login method)
		oauthGroup.POST("/password/login", oauthHandler.PasswordLogin)

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
		// System monitoring routes (require provider)
		systemGroup := protected.Group("/system")
		systemGroup.Use(middleware.RequireProvider())
		{
			systemGroup.GET("/metrics", systemHandler.GetSystemMetrics)
			systemGroup.GET("/database/metrics", systemHandler.GetDatabaseMetrics)
			systemGroup.GET("/logs", logHandler.GetLogs)
		}

		// Generic application list route (accessible by all authenticated users).
		// Providers see the whole app library; tenants see apps distributed to their org.
		protected.GET("/apps", func(c *gin.Context) {
			orgID := c.GetInt("org_id")
			role := c.GetString("role")
			userID := c.GetInt("user_id")
			var apps []*model.Application
			var err error
			if role == "provider" {
				apps, err = distService.ListAllApps(c.Request.Context())
			} else {
				apps, err = distService.ListAppsForOrg(c.Request.Context(), orgID)
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			// Mask container IDs for non-provider roles
			if role != "provider" {
				for _, a := range apps {
					a.ContainerID = ""
				}
			}
			// Annotate app-admin capability (provider is implicitly an admin of everything)
			type appView struct {
				*model.Application
				IsAdmin bool `json:"isAdmin"`
			}
			views := make([]appView, 0, len(apps))
			for _, a := range apps {
				isAdmin := true
				if role != "provider" {
					admin, err := distService.IsAppAdmin(c.Request.Context(), userID, orgID, a.ID)
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
						return
					}
					isAdmin = admin
				}
				views = append(views, appView{Application: a, IsAdmin: isAdmin})
			}
			c.JSON(http.StatusOK, gin.H{"apps": views})
		})

		// App data management (app admins per org + providers; authorization in-handler)
		dataGroup := protected.Group("/data")
		{
			dataGroup.GET("/orgs/:orgId/apps/:appId/tables", dataHandler.ListTables)
			dataGroup.GET("/orgs/:orgId/apps/:appId/tables/:tableName/rows", dataHandler.ListRows)
			dataGroup.POST("/orgs/:orgId/apps/:appId/tables/:tableName/rows", dataHandler.InsertRow)
			dataGroup.PUT("/orgs/:orgId/apps/:appId/tables/:tableName/rows/:rowId", dataHandler.UpdateRow)
			dataGroup.DELETE("/orgs/:orgId/apps/:appId/tables/:tableName/rows/:rowId", dataHandler.DeleteRow)
		}

		// Provider portal routes (require provider)
		providerGroup := protected.Group("/provider")
		providerGroup.Use(middleware.RequireProvider())
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
				orgUsers.POST("/:userId/reset-password", orgMemberHandler.ResetPassword)
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
			appGroup.POST("/import", appHandler.Import)
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

				// App distribution (multi-tenant sharing + app admins)
				distGroup := providerGroup.Group("/apps/:appId/distributions")
				{
					distGroup.GET("", distHandler.List)
					distGroup.POST("", distHandler.Distribute)
					distGroup.DELETE("/:orgId", distHandler.Undistribute)
					distGroup.POST("/:orgId/admins", distHandler.SetAdmin)
					distGroup.DELETE("/:orgId/admins/:userId", distHandler.RemoveAdmin)
				}
			}

			// Audit log queries (MCP call log viewer + general audit)
			providerGroup.GET("/audit/logs", auditHandler.ListLogs)

			// File upload routes (provider-operated; app data files)
			files := providerGroup.Group("/files")
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
			&model.ApplicationDistribution{},
			&model.ApplicationAdmin{},
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

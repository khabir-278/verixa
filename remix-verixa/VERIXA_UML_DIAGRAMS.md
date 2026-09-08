# VERIXA Platform — Complete UML System Specifications & Architectural Diagrams

> **Project:** VERIXA AI-Safe Social Media Platform & Neural Defense Architecture  
> **Repository:** `khabir-278/verixa`  
> **Specification Standard:** Unified Modeling Language (OMG UML 2.5)  
> **Generation Date:** 2026-09-08  

---

## Table of Contents

1. [Executive Architectural Overview](#1-executive-architectural-overview)
2. [Structural UML Diagrams](#2-structural-uml-diagrams)
   - [2.1 High-Level Component Diagram](#21-high-level-component-diagram)
   - [2.2 Modular Package Diagram](#22-modular-package-diagram)
   - [2.3 Detailed Domain & Service Class Diagram](#23-detailed-domain--service-class-diagram)
   - [2.4 Database Entity-Relationship Diagram (ERD / Logical Data Model)](#24-database-entity-relationship-diagram-erd--logical-data-model)
   - [2.5 Deployment & Cloud Infrastructure Diagram](#25-deployment--cloud-infrastructure-diagram)
3. [Behavioral UML Diagrams](#3-behavioral-uml-diagrams)
   - [3.1 System Use Case Diagram](#31-system-use-case-diagram)
   - [3.2 Sequence Diagram 1: Content Publishing & AI Moderation Gateway Pipeline](#32-sequence-diagram-1-content-publishing--ai-moderation-gateway-pipeline)
   - [3.3 Sequence Diagram 2: Behavioral Safety & AI Guardian Risk Engine](#33-sequence-diagram-2-behavioral-safety--ai-guardian-risk-engine)
   - [3.4 Sequence Diagram 3: Moderation Appeal & Human-in-the-Loop Review Queue](#34-sequence-diagram-3-moderation-appeal--human-in-the-loop-review-queue)
   - [3.5 Sequence Diagram 4: Personalized Feed Recommendation & Transparent Explainability](#35-sequence-diagram-4-personalized-feed-recommendation--transparent-explainability)
   - [3.6 Activity Diagram: End-to-End Content Ingestion & Multi-Tier Verification Pipeline](#36-activity-diagram-end-to-end-content-ingestion--multi-tier-verification-pipeline)
   - [3.7 State Machine Diagram 1: Content Moderation Lifecycle](#37-state-machine-diagram-1-content-moderation-lifecycle)
   - [3.8 State Machine Diagram 2: User Guardian Risk Level & Adaptive Restrictions](#38-state-machine-diagram-2-user-guardian-risk-level--adaptive-restrictions)
   - [3.9 State Machine Diagram 3: Moderation Review & Appeal Lifecycle](#39-state-machine-diagram-3-moderation-review--appeal-lifecycle)
4. [Subsystem Mapping Matrix](#4-subsystem-mapping-matrix)

---

## 1. Executive Architectural Overview

VERIXA is an end-to-end, AI-defended social platform engineered around **zero-tolerance digital safety, transparent feed recommendation, and multi-signal behavioral risk management**. 

The system architecture is bifurcated into:
- **Client Tier**: A responsive single-page application built on **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Lucide/Motion** components, communicating with backend micro-services via REST and Supabase Realtime subscriptions.
- **Server Tier**: An Express.js and TypeScript runtime exposing specialized engines:
  1. **Centralized AI Moderation Gateway** (`ModerationGateway`)
  2. **Multilingual & Script Analyzer** (`languageDetector`, `aiAnalyzer`)
  3. **Media Safety & Deepfake Detector** (`mediaAnalyzer`, `videoSafetyEngine`, `gifExtractor`)
  4. **Behavioral Safety Suite** (Cyberbullying, Spam, Fake Account Heuristics, Privacy Scanner)
  5. **AI Guardian Mode Engine** (`guardianService`)
  6. **Human Review & Appeals System** (`reviewService`)
  7. **Personalized Feed Recommendation Engine** (`feedService`, `TransparentHeuristicRanker`, `MLRecommendationRanker`)
  8. **Sentinel AI Chatbot Assistant** (`GoogleGenAI` integration)
- **Data Tier**: **Supabase (PostgreSQL 15+)** with Row-Level Security (RLS), real-time replication, storage buckets, database triggers, and synchronized fallback local JSON event ledgers.

---

## 2. Structural UML Diagrams

### 2.1 High-Level Component Diagram

This diagram captures the physical and logical boundaries of VERIXA's subsystem components, inter-component interfaces, and external API dependencies.

```mermaid
graph TB
  subgraph Client_Tier["Client Presentation Tier (React 19 + Vite)"]
    UI_Feed["HomeFeed & Reels UI\n(HomeFeedPage, ReelsPage)"]
    UI_SafetyModals["Safety Interceptors\n(AIScannerModal, BlockedCommentModal)"]
    UI_Admin["Admin & AI Dashboard\n(AIDashboardPage, ThreatAlerts)"]
    UI_Sentinel["Sentinel AI Assistant\n(AIFloatingSentinel, SentinelAIChatbotPage)"]
    AppContext["Central State & Realtime Bus\n(AppContext)"]
    ClientServices["Client Data Gateways\n(supabaseServices.ts, privacyScanner.ts)"]
    
    UI_Feed --> AppContext
    UI_SafetyModals --> AppContext
    UI_Admin --> AppContext
    UI_Sentinel --> AppContext
    AppContext --> ClientServices
  end

  subgraph Server_Tier["Server Application Tier (Node.js / Express TS)"]
    ServerRouter["Express API Router\n(server.ts)"]
    
    subgraph Moderation_Subsystem["AI Moderation & Safety Subsystem"]
      ModGateway["Moderation Gateway\n(moderationGateway.ts)"]
      Normalizer["Normalizer & Anti-Prompt Injector\n(normalizer.ts)"]
      LangDetector["Language & Script Detector\n(languageDetector.ts)"]
      AIAnalyzer["Text & Multilingual Analyzer\n(aiAnalyzer.ts)"]
      MediaEngine["Media & Video Safety Engine\n(mediaAnalyzer, videoSafetyEngine, gifExtractor)"]
      PolicyEngine["Policy & Decision Engine\n(policyEngine.ts)"]
      
      ModGateway --> Normalizer
      Normalizer --> LangDetector
      LangDetector --> AIAnalyzer
      LangDetector --> MediaEngine
      AIAnalyzer --> PolicyEngine
      MediaEngine --> PolicyEngine
    end

    subgraph Behavioral_Subsystem["Behavioral Intelligence Subsystem"]
      CyberbullyingSvc["Cyberbullying Detector\n(cyberbullyingService.ts)"]
      SpamSvc["Spam & Velocity Engine\n(spamService.ts)"]
      FakeAcctSvc["Fake Account Risk Evaluator\n(fakeAccountService.ts)"]
      PrivacySvc["Privacy & PII Scanner\n(privacyScanner.ts)"]
      ReputationSvc["Reputation Ledger Engine\n(reputationService.ts)"]
      GuardianSvc["AI Guardian Mode Engine\n(guardianService.ts)"]
      ReviewSvc["Review & Appeals Service\n(reviewService.ts)"]

      CyberbullyingSvc --> GuardianSvc
      SpamSvc --> GuardianSvc
      FakeAcctSvc --> GuardianSvc
      PrivacySvc --> GuardianSvc
      ReputationSvc --> GuardianSvc
      GuardianSvc --> ReviewSvc
    end

    subgraph Feed_Subsystem["Personalized Feed Subsystem"]
      FeedSvc["Feed Service\n(feedService.ts)"]
      CandidateRetrieval["Candidate Post Collector"]
      ContextAggregator["Viewer Context Aggregator"]
      RankingStrategy["Pluggable Ranking Strategy\n(TransparentHeuristic, MLRanker)"]
      ExplainabilityGen["Explainability Generator"]
      
      FeedSvc --> CandidateRetrieval
      FeedSvc --> ContextAggregator
      CandidateRetrieval --> RankingStrategy
      ContextAggregator --> RankingStrategy
      RankingStrategy --> ExplainabilityGen
    end

    ServerRouter --> ModGateway
    ServerRouter --> Behavioral_Subsystem
    ServerRouter --> FeedSvc
  end

  subgraph External_Services["External Cloud & AI Services"]
    GeminiAPI["Google Gemini 2.5/Flash AI API\n(@google/genai)"]
    SupabaseAuth["Supabase Auth (JWT / OAuth)"]
    SupabaseDB["Supabase PostgreSQL 15+\n(26 Tables, Triggers, RLS)"]
    SupabaseStorage["Supabase Media Storage\n(Images, Video Blobs)"]
  end

  ClientServices -->|HTTPS / WSS| ServerRouter
  ClientServices -->|Direct RLS Query| SupabaseDB
  ClientServices -->|Media Storage| SupabaseStorage
  ClientServices -->|Auth Sessions| SupabaseAuth

  AIAnalyzer -->|Multimodal Inferences| GeminiAPI
  MediaEngine -->|Vision Analysis| GeminiAPI
  ServerRouter -->|LLM Queries| GeminiAPI
  ServerRouter -->|Service Role Client| SupabaseDB
  ServerRouter -->|Media Management| SupabaseStorage
```

---

### 2.2 Modular Package Diagram

This diagram displays the structural organization of source code packages, module boundaries, and dependency hierarchies.

```mermaid
graph TB
  subgraph Root["Project Root (/remix-verixa)"]
    package_json["package.json / tsconfig.json"]
    schema_sql["supabase_schema.sql"]
    server_entry["server.ts"]
    
    subgraph Client_Package["src/ (Client-Side Package)"]
      src_App["App.tsx / main.tsx / index.css"]
      src_types["types.ts (Client Domain Interfaces)"]
      
      subgraph Components_Pkg["src/components/"]
        comp_nav["Navbar.tsx / Sidebar.tsx"]
        comp_modals["AIScannerModal.tsx / BlockedCommentModal.tsx / CreatePostModal.tsx"]
        comp_sentinel["AIFloatingSentinel.tsx"]
        comp_toast["ToastContainer.tsx"]
      end
      
      subgraph Context_Pkg["src/context/"]
        ctx_app["AppContext.tsx (Unified Client State Provider)"]
      end
      
      subgraph Pages_Pkg["src/pages/"]
        pages_feed["HomeFeedPage.tsx / ReelsPage.tsx / ExplorePage.tsx"]
        pages_user["ProfilePage.tsx / MessagesPage.tsx / NotificationsPage.tsx / SettingsPage.tsx"]
        pages_safety["AIDashboardPage.tsx / SentinelAIChatbotPage.tsx"]
        pages_auth["LandingPage.tsx / LoginPage.tsx / SignupPage.tsx / VerifyEmailPage.tsx"]
        pages_info["AboutPage.tsx / PrivacyPage.tsx / TermsPage.tsx / HelpCenterPage.tsx"]
      end
      
      subgraph Lib_Pkg["src/lib/"]
        lib_supabase["supabase.ts (Client Supabase Instance)"]
        lib_services["supabaseServices.ts (DB APIs, Realtime, Triggers)"]
        lib_firebase["firebase.ts (Auth Handlers)"]
        lib_scanner["privacyScanner.ts (PII Regex Scanner)"]
        lib_video["videoFrameExtractor.ts (HTML5 Canvas Extractor)"]
      end
    end

    subgraph Server_Package["server/ (Server-Side Package)"]
      subgraph Moderation_Pkg["server/moderation/"]
        mod_index["index.ts (Barrel Export)"]
        mod_types["types.ts (Server Safety Contracts)"]
        mod_gateway["moderationGateway.ts"]
        mod_normalizer["normalizer.ts"]
        mod_lang["languageDetector.ts"]
        mod_ai["aiAnalyzer.ts"]
        mod_media["mediaAnalyzer.ts / videoSafetyEngine.ts / gifExtractor.ts"]
        mod_policy["policyEngine.ts / secondarySafetyRules.ts"]
        mod_behavioral["cyberbullyingService.ts / spamService.ts / fakeAccountService.ts / privacyScanner.ts"]
        mod_guardian["guardianService.ts / reputationService.ts"]
        mod_review["reviewService.ts"]
        mod_persist["persistence.ts / notificationService.ts / rateLimiter.ts"]
      end

      subgraph Feed_Pkg["server/feed/"]
        feed_index["index.ts (Barrel Export)"]
        feed_types["types.ts (Feed Contracts & DTOs)"]
        feed_service["feedService.ts"]
        feed_ranking["rankingStrategy.ts (Heuristic & ML Rankers)"]
      end
    end

    subgraph Data_Storage["data/ (Synchronized JSON Persistence)"]
      data_json["appeals.json / review_queue.json / reports.json\ninteraction_events.json / recommendation_events.json"]
    end
  end

  %% Dependencies
  Pages_Pkg --> Components_Pkg
  Pages_Pkg --> Context_Pkg
  Components_Pkg --> Context_Pkg
  Context_Pkg --> Lib_Pkg
  Lib_Pkg --> src_types
  
  server_entry --> Moderation_Pkg
  server_entry --> Feed_Pkg
  Moderation_Pkg --> Data_Storage
  Feed_Pkg --> Data_Storage
```

---

### 2.3 Detailed Domain & Service Class Diagram

This class diagram depicts the domain entities, safety records, controllers, and core services with their properties, method signatures, and associations.

```mermaid
classDiagram
  direction TB

  %% Domain Entities
  class User {
    +string id
    +string username
    +string name
    +string avatar
    +string bio
    +boolean verified
    +string aiTrustBadge
    +number safetyScore
    +number followersCount
    +number followingCount
    +number postsCount
    +string role
    +string createdAt
  }

  class Post {
    +string id
    +User user
    +string caption
    +string mediaUrl
    +string mediaType
    +number likes
    +number shares
    +string timestamp
    +string[] tags
    +string category
    +number aiSafetyScore
    +AIScanDetails aiScanDetails
    +RecommendationExplainability explainability
  }

  class Comment {
    +string id
    +string postId
    +User user
    +string content
    +string timestamp
    +number toxicityScore
    +string[] categories
    +string aiStatus
    +number likes
  }

  class Story {
    +string id
    +User user
    +string mediaUrl
    +string type
    +string timestamp
    +boolean viewed
    +boolean isAIModerated
    +number viewsCount
    +string[] viewedBy
    +number likesCount
    +string expiresAt
  }

  class Reel {
    +string id
    +User user
    +string caption
    +string videoUrl
    +string audioTitle
    +number likes
    +number commentsCount
    +string aiTrustBadge
    +number deepfakeRisk
    +string moderationStatus
  }

  %% Moderation & Behavioral Entities
  class NormalizedModerationResponse {
    +string decision
    +boolean allowed
    +string status
    +string state
    +string content_type
    +string language
    +string[] categories
    +number toxicity_score
    +number confidence
    +number risk_score
    +string reason
    +string safe_rewrite
    +string analysis_id
    +MediaInspectionScores scores
  }

  class GuardianScoreRecord {
    +string id
    +string user_id
    +number guardian_score
    +string risk_level
    +number confidence
    +GuardianExplainability explainability
    +string[] allowed_actions
    +string last_calculated_at
  }

  class UserRestrictionRecord {
    +string id
    +string user_id
    +string risk_level
    +boolean upload_restricted
    +boolean comment_restricted
    +boolean messaging_restricted
    +boolean account_suspended
    +number upload_cooldown_seconds
    +number comment_cooldown_seconds
    +string appeal_status
  }

  class AppealRecord {
    +string id
    +string user_id
    +string analysis_id
    +string content_id
    +string content_type
    +string original_decision
    +string reason
    +string appeal_text
    +string status
    +string admin_decision
    +string admin_id
  }

  class ReviewQueueItem {
    +string id
    +string item_type
    +string reference_id
    +string content_id
    +string user_id
    +string priority
    +number risk_score
    +string category
    +string status
    +string claimed_by
  }

  %% Services & Engines
  class ModerationGateway {
    +moderate(input: ModerationRequestInput) Promise~NormalizedModerationResponse~
    +getEvents(limit: number) ModerationEventRecord[]
  }

  class GuardianService {
    -Map userEvents
    -Map userScores
    -Map userRestrictions
    -Map appeals
    -number SLIDING_WINDOW_MS
    +getRiskLevel(score: number) GuardianRiskLevel
    +getAllowedActionsForTier(riskLevel: GuardianRiskLevel) string[]
    +recordEvent(input: RecordGuardianEventInput) Promise~GuardianScoreRecord~
    +getGuardianScore(userId: string) Promise~GuardianScoreRecord~
    +getUserRestrictions(userId: string) Promise~UserRestrictionRecord~
    +checkUserAction(userId: string, action: string) Promise~CheckResult~
    +fileAppeal(userId: string, text: string, reason: string) Promise~GuardianAppealRecord~
    +resolveAppeal(appealId: string, status: string, reviewerId: string) Promise~GuardianAppealRecord~
  }

  class CyberbullyingService {
    -InteractionRecord[] interactions
    -CyberbullyingEvent[] events
    +recordInteraction(data: object) InteractionRecord
    +analyzeBullyingPatterns(targetUserId: string, actorUserId: string) BullyingAnalysisResult
    +getBullyingEventsForUser(userId: string) CyberbullyingEvent[]
  }

  class SpamService {
    -Map userActionHistory
    -hashContent(text: string) string
    -computeSimilarity(textA: string, textB: string) number
    +checkSpam(userId: string, content: string, type: string) SpamCheckResult
  }

  class FakeAccountService {
    +evaluateAccountRisk(factors: object) FakeAccountRiskEvaluation
  }

  class ReviewService {
    +submitAppeal(input: SubmitAppealInput) Promise~AppealRecord~
    +fileReport(input: FileReportInput) Promise~ReportRecord~
    +enqueueQuarantineItem(analysisId: string, contentId: string, type: string) ReviewQueueItem
    +getReviewQueue(filters: object) Promise~ReviewQueueItem[]~
    +resolveReviewQueueItem(id: string, adminId: string, action: string) Promise~ReviewQueueItem~
    +decideAppeal(appealId: string, decision: string, adminId: string) Promise~AppealRecord~
    +getAdminDashboardStats() Promise~AdminDashboardMetrics~
  }

  class FeedService {
    -FeedRankingStrategy currentStrategy
    -FeedScoringWeights weights
    +getPersonalizedFeed(viewerId: string, options: object) Promise~RankedFeedResult~
    +recordInteraction(event: object) Promise~InteractionEventRecord~
    +getExplainability(postId: string, viewerId: string) Promise~RecommendationExplainability~
    +getWeights() FeedScoringWeights
    +setWeights(weights: object) FeedScoringWeights
  }

  class TransparentHeuristicRanker {
    +id: string
    +name: string
    +version: string
    +rank(candidates: PostCandidate[], context: ViewerContext, weights: FeedScoringWeights) Promise~RankedPostItem[]~
    -computeRecencyScore(createdAt: string) number
    -computeEngagementScore(candidate: PostCandidate) number
  }

  %% Relationships
  User "1" -- "*" Post : authors
  Post "1" -- "*" Comment : contains
  User "1" -- "*" Comment : creates
  User "1" -- "*" Story : publishes
  User "1" -- "*" Reel : uploads
  User "1" -- "1" GuardianScoreRecord : possesses
  User "1" -- "0..1" UserRestrictionRecord : constrained_by
  User "1" -- "*" AppealRecord : initiates
  
  ModerationGateway ..> NormalizedModerationResponse : outputs
  ModerationGateway ..> ReviewService : auto-enqueues QUARANTINE
  GuardianService ..> GuardianScoreRecord : calculates
  GuardianService ..> UserRestrictionRecord : enforces
  CyberbullyingService ..> GuardianService : reports signals
  SpamSvc ..> GuardianService : reports signals
  FakeAcctSvc ..> GuardianService : reports signals
  ReviewService ..> AppealRecord : resolves
  ReviewService ..> ReviewQueueItem : triages
  ReviewService ..> GuardianService : applies restitution
  FeedService ..> TransparentHeuristicRanker : executes strategy
  FeedService ..> Post : ranks & serves
```

---

### 2.4 Database Entity-Relationship Diagram (ERD / Logical Data Model)

VERIXA utilizes a PostgreSQL 15 schema managed via Supabase (`supabase_schema.sql`), with 26 dedicated tables enforcing strict referential integrity, automated denormalization counter triggers, and audit logging.

```mermaid
erDiagram
  PROFILES {
    uuid id PK
    text username UK
    text name
    text email
    text avatar
    text bio
    text role
    boolean verified
    integer safety_score
    text ai_trust_badge
    integer followers_count
    integer following_count
    integer posts_count
    timestamptz created_at
    timestamptz updated_at
  }

  POSTS {
    uuid id PK
    uuid user_id FK
    text caption
    text media_url
    text media_type
    text[] hashtags
    integer likes_count
    integer comments_count
    text visibility
    text moderation_status
    integer ai_safety_score
    jsonb ai_scan_details
    timestamptz created_at
    timestamptz updated_at
  }

  COMMENTS {
    uuid id PK
    uuid post_id FK
    uuid user_id FK
    text text
    integer toxicity_score
    text moderation_status
    timestamptz created_at
  }

  LIKES {
    uuid id PK
    uuid post_id FK
    uuid user_id FK
    timestamptz created_at
  }

  FOLLOWS {
    uuid id PK
    uuid follower_id FK
    uuid following_id FK
    timestamptz created_at
  }

  SAVED_POSTS {
    uuid id PK
    uuid user_id FK
    uuid post_id FK
    timestamptz created_at
  }

  STORIES {
    uuid id PK
    uuid user_id FK
    text media_url
    text media_type
    text moderation_status
    text analysis_id
    integer views_count
    uuid[] viewed_by
    integer likes_count
    timestamptz created_at
    timestamptz expires_at
  }

  REELS {
    uuid id PK
    uuid user_id FK
    text caption
    text video_url
    text audio_title
    integer likes_count
    integer comments_count
    text ai_trust_badge
    integer deepfake_risk
    text moderation_status
    timestamptz created_at
  }

  MESSAGES {
    uuid id PK
    text conversation_id
    uuid sender_id FK
    uuid receiver_id FK
    text text
    text media_url
    boolean is_ai_verified
    timestamptz created_at
  }

  NOTIFICATIONS {
    uuid id PK
    uuid recipient_id FK
    uuid sender_id FK
    text type
    uuid post_id FK
    text message
    boolean read
    timestamptz created_at
  }

  REPORTS {
    uuid id PK
    uuid reporter_id FK
    text target_id
    text target_type
    text reason
    text description
    text severity
    text status
    uuid resolved_by FK
    timestamptz resolved_at
    timestamptz created_at
  }

  MODERATION_LOGS {
    uuid id PK
    text analysis_id UK
    uuid user_id FK
    text target_id
    text target_type
    text decision
    text status
    integer toxicity_score
    integer confidence
    text[] categories
    text reason
    text language
    jsonb metadata
    timestamptz created_at
  }

  GUARDIAN_SCORES {
    uuid id PK
    uuid user_id FK,UK
    numeric score
    text risk_level
    numeric confidence
    jsonb explainability
    jsonb signals_summary
    timestamptz last_calculated_at
    timestamptz updated_at
  }

  GUARDIAN_EVENTS {
    uuid id PK
    uuid user_id FK
    text event_type
    text severity
    numeric impact
    numeric confidence
    text source
    text reason
    jsonb metadata
    timestamptz created_at
  }

  USER_RESTRICTIONS {
    uuid id PK
    uuid user_id FK,UK
    text risk_level
    boolean upload_restricted
    boolean comment_restricted
    boolean messaging_restricted
    boolean account_suspended
    integer upload_cooldown_seconds
    integer comment_cooldown_seconds
    text appeal_status
    timestamptz created_at
    timestamptz updated_at
  }

  MODERATION_APPEALS {
    uuid id PK
    uuid user_id FK
    text analysis_id
    text content_id
    text content_type
    text original_decision
    text reason
    text appeal_text
    text status
    text admin_decision
    uuid admin_id FK
    timestamptz created_at
    timestamptz resolved_at
  }

  REVIEW_QUEUE {
    uuid id PK
    text item_type
    text reference_id
    text content_id
    text content_type
    uuid user_id FK
    text priority
    integer risk_score
    text category
    text status
    uuid claimed_by FK
    timestamptz created_at
    timestamptz updated_at
  }

  ADMIN_ACTIONS {
    uuid id PK
    uuid admin_id FK
    text action_type
    text target_type
    text target_id
    uuid affected_user_id FK
    text reason
    numeric guardian_adjustment
    numeric reputation_adjustment
    timestamptz created_at
  }

  USER_INTERACTION_EVENTS {
    uuid id PK
    uuid user_id FK
    uuid post_id FK
    text interaction_type
    integer dwell_time_ms
    jsonb metadata
    timestamptz created_at
  }

  SERVED_RECOMMENDATION_EVENTS {
    uuid id PK
    uuid user_id FK
    uuid post_id FK
    integer rank_position
    numeric total_score
    jsonb scoring_factors
    text model_version
    timestamptz served_at
  }

  %% Entity Relationships
  PROFILES ||--o{ POSTS : "authors"
  PROFILES ||--o{ COMMENTS : "writes"
  POSTS ||--o{ COMMENTS : "contains"
  PROFILES ||--o{ LIKES : "creates"
  POSTS ||--o{ LIKES : "receives"
  PROFILES ||--o{ FOLLOWS : "follower"
  PROFILES ||--o{ FOLLOWS : "following"
  PROFILES ||--o{ SAVED_POSTS : "saves"
  POSTS ||--o{ SAVED_POSTS : "saved_by"
  PROFILES ||--o{ STORIES : "publishes"
  PROFILES ||--o{ REELS : "uploads"
  PROFILES ||--o{ MESSAGES : "sends"
  PROFILES ||--o{ MESSAGES : "receives"
  PROFILES ||--o{ NOTIFICATIONS : "receives"
  PROFILES ||--o{ REPORTS : "files"
  PROFILES ||--o{ MODERATION_LOGS : "triggers"
  PROFILES ||--o{ GUARDIAN_SCORES : "maintains"
  PROFILES ||--o{ GUARDIAN_EVENTS : "logs"
  PROFILES ||--o{ USER_RESTRICTIONS : "subject_to"
  PROFILES ||--o{ MODERATION_APPEALS : "submits"
  PROFILES ||--o{ REVIEW_QUEUE : "subject_of"
  PROFILES ||--o{ ADMIN_ACTIONS : "affected_by"
  PROFILES ||--o{ USER_INTERACTION_EVENTS : "emits"
  POSTS ||--o{ USER_INTERACTION_EVENTS : "target_of"
  PROFILES ||--o{ SERVED_RECOMMENDATION_EVENTS : "receives"
  POSTS ||--o{ SERVED_RECOMMENDATION_EVENTS : "served_in"
```

---

### 2.5 Deployment & Cloud Infrastructure Diagram

This diagram displays the execution topologies, runtime containers, hardware nodes, network boundaries, and secure protocols connecting VERIXA's distributed services.

```mermaid
graph TB
  subgraph Client_Environment["Client Device Environment (Browser / Mobile Web)"]
    BrowserNode["Modern Web Browser (Chrome, Safari, Firefox, Edge)\n- React 19 SPA DOM Engine\n- HTML5 Video Frame Extractor & Canvas API\n- Local Storage & Client Cache\n- Web Crypto & TLS 1.3"]
  end

  subgraph CDN_Edge["Edge / CDN Tier"]
    ViteProxy["Vite Edge / Reverse Proxy\n- Static Asset Caching\n- Gzip / Brotli Compression\n- SSL Termination (:443)"]
  end

  subgraph Application_Server_Host["Application Server Runtime (Node.js 20+ / Container)"]
    ExpressHost["Express HTTP / REST Server (:3000)\n- Body Limit: 25MB (Multipart / Base64 Media)\n- IP-based Sliding Rate Limiters (60 req/min)\n- TSX Execution / ESBuild Bundler\n- Sentinel AI Chatbot Proxy\n- In-Memory Sliding Event Windows (14-day & 72-hr)"]
    LocalDataStore["Local Persistent Storage\n- /data/*.json Ledger Mirror\n- Debounced File Flusher"]
    ExpressHost <--> LocalDataStore
  end

  subgraph Supabase_Cloud_Platform["Supabase Managed Cloud Infrastructure"]
    KongGateway["Kong API Gateway (HTTPS / WSS)"]
    GoTrue["GoTrue Auth Service (JWT / Session Tokens)"]
    PostgresNode["PostgreSQL 15+ Enterprise Instance\n- Connection Pooling (PgBouncer)\n- Row Level Security (RLS) Policy Engine\n- Automated PL/pgSQL Triggers & Functions\n- PostGIS & Crypto Extensions"]
    RealtimeNode["Realtime Engine (Elixir / Phoenix Channels)\n- PostgreSQL CDC (Change Data Capture)\n- WebSocket Broadcast to Clients"]
    StorageNode["Supabase S3 Storage Engine\n- Buckets: post-media, story-media, reel-media\n- Signed URLs & Presigned Upload Tokens"]

    KongGateway --> GoTrue
    KongGateway --> PostgresNode
    KongGateway --> RealtimeNode
    KongGateway --> StorageNode
  end

  subgraph AI_Cloud_Provider["Google Cloud Platform (AI Studio)"]
    GeminiModelNode["Gemini 2.5 / Flash Neural Models\n- Multimodal Content Vision API\n- Multilingual Moderation & Reasoning\n- Sentinel System Prompt Assistant"]
  end

  %% Network Connectivity
  BrowserNode -->|HTTPS :443 / REST| ViteProxy
  ViteProxy -->|Reverse Proxy / Internal HTTP| ExpressHost
  BrowserNode -->|WSS / Realtime Updates| KongGateway
  BrowserNode -->|Direct Client Reads / Signed Uploads| KongGateway
  ExpressHost -->|Service Role Secret Access / SQL| KongGateway
  ExpressHost -->|HTTPS TLS 1.3 / gRPC| GeminiModelNode
```

---

## 3. Behavioral UML Diagrams

### 3.1 System Use Case Diagram

This diagram visualizes the behavioral interactions between system actors (**Regular User**, **Authenticated User**, **Content Creator**, **Moderator/Admin**, and **Sentinel AI Sentinel**) and the primary platform use cases.

```mermaid
graph LR
  %% Actors
  ActorUser["👤 Regular / Authenticated User"]
  ActorCreator["🎨 Content Creator"]
  ActorAdmin["🛡️ System Admin / Moderator"]
  ActorBot["🤖 Sentinel AI Assistant"]

  %% Subsystem Boundary
  subgraph Platform_UseCases["VERIXA AI Platform System Boundary"]
    UC_Auth["Sign Up / Login / Verify Email"]
    UC_Feed["Browse Transparent Personalized Feed"]
    UC_Explain["Inspect 'Why was I recommended this?'"]
    UC_CreatePost["Create Post / Story / Reel"]
    UC_ClientPII["Run Pre-Submit Client Privacy Check"]
    UC_GatewayScan["Undergo AI Moderation Gateway Scan"]
    UC_Comment["Post Comment with Toxicity Filter"]
    UC_Appeal["Submit Moderation / Restriction Appeal"]
    UC_ChatSentinel["Consult Sentinel AI Assistant"]
    UC_Report["Report Harmful Content / User"]
    
    UC_ReviewQueue["Inspect Triage Review Queue"]
    UC_DecideAppeal["Approve / Reject User Appeal"]
    UC_AdminSanction["Apply Manual Sanction / Overturn Block"]
    UC_MonitorThreats["Analyze Real-time Threat Breakdown"]
    UC_TuneWeights["Adjust Feed Recommendation Weights"]
    
    UC_GuardianEval["Continuous Behavioral Guardian Evaluation"]
  end

  %% Actor Connections
  ActorUser --> UC_Auth
  ActorUser --> UC_Feed
  ActorUser --> UC_Explain
  ActorUser --> UC_Comment
  ActorUser --> UC_Appeal
  ActorUser --> UC_ChatSentinel
  ActorUser --> UC_Report

  ActorCreator --> UC_CreatePost
  UC_CreatePost -.->|includes| UC_ClientPII
  UC_CreatePost -.->|includes| UC_GatewayScan
  UC_Comment -.->|includes| UC_GatewayScan

  ActorAdmin --> UC_ReviewQueue
  ActorAdmin --> UC_DecideAppeal
  ActorAdmin --> UC_AdminSanction
  ActorAdmin --> UC_MonitorThreats
  ActorAdmin --> UC_TuneWeights

  ActorBot --> UC_ChatSentinel
  
  %% System Automated Use Cases
  UC_GatewayScan -.->|triggers| UC_GuardianEval
  UC_Comment -.->|triggers| UC_GuardianEval
  UC_DecideAppeal -.->|updates| UC_GuardianEval
```

---

### 3.2 Sequence Diagram 1: Content Publishing & AI Moderation Gateway Pipeline

This diagram traces the exact synchronous execution sequence of a user publishing content through the 10-step AI Moderation Gateway.

```mermaid
sequenceDiagram
  autonumber
  actor User as Content Author
  participant UI as CreatePostModal / AppContext
  participant ClientScan as Client PrivacyScanner
  participant Router as Express Server (server.ts)
  participant Gateway as ModerationGateway
  participant Normalizer as Normalizer & Anti-Injection
  participant Lang as LanguageDetector
  participant AI as AIAnalyzer / MediaAnalyzer
  participant Gemini as Google Gemini AI API
  participant Policy as PolicyEngine
  participant DB as Supabase DB (Posts / Mod Logs)
  participant Review as ReviewService

  User->>UI: Selects media, types caption, clicks "Post"
  UI->>ClientScan: scanContentForPII(caption)
  alt PII Detected (Phone, Aadhaar, Bank Account)
    ClientScan-->>UI: Warns user with masked preview
    UI-->>User: Displays Privacy Warning Modal (User may cancel or proceed)
  end

  UI->>Router: POST /api/moderation/gateway (content, type, metadata)
  Router->>Gateway: moderate(input)
  
  Note over Gateway: Step 1: Content Type Detection & Payload Size Check
  Gateway->>Normalizer: processNormalization(rawContent, type)
  Note over Normalizer: Sanitizes control chars, unescapes, scrubs prompt injection patterns
  Normalizer-->>Gateway: normalizedInput, contentHash

  Gateway->>Lang: detectLanguageAndScript(text)
  Lang-->>Gateway: language: "en", script: "Latin", confidence: 0.98

  Gateway->>AI: executeAIAnalysis(normalizedInput, mimeType, context)
  AI->>Gemini: generateContent(Multimodal Safety Analysis Prompt)
  Gemini-->>AI: Raw JSON (toxicity: 0.02, nsfw: 0.01, deepfake: 0.00, categories: ["Safe"])
  AI-->>Gateway: AnalysisResult

  Gateway->>Policy: evaluatePolicy(AnalysisResult, type)
  Note over Policy: Evaluates thresholds:<br/>Toxicity > 70 -> BLOCK<br/>Deepfake > 85 -> QUARANTINE<br/>NSFW > 80 -> BLOCK<br/>Otherwise -> ALLOW
  Policy-->>Gateway: NormalizedModerationResponse (decision: ALLOW, allowed: true)

  Gateway->>DB: persistModerationEvent(analysisRecord)
  
  opt Decision == 'QUARANTINE'
    Gateway->>Review: enqueueQuarantineItem(analysisId, contentId, priority)
  end

  Gateway-->>Router: Policy Decision Object
  Router-->>UI: 200 OK (allowed: true, scanDetails)
  
  UI->>DB: createPost(caption, mediaUrl, scanDetails)
  DB-->>UI: Post Created (id: uuid, status: 'approved')
  UI-->>User: Closes modal, renders post in Feed with AI Safety Score: 99%
```

---

### 3.3 Sequence Diagram 2: Behavioral Safety & AI Guardian Risk Engine

This diagram illustrates how multi-source signals (toxicity, cyberbullying, spam, fake account heuristics) are captured and evaluated to dynamically recalculate a user's Guardian Risk Level and enforce automated rate limits or cooldowns.

```mermaid
sequenceDiagram
  autonumber
  actor Attacker as Suspicious User / Actor
  actor Victim as Target User
  participant UI as Client UI / Comments
  participant Router as Express Server
  participant Spam as SpamService
  participant Bully as CyberbullyingService
  participant Guardian as GuardianService
  participant DB as Supabase (guardian_scores, user_restrictions)

  Attacker->>UI: Submits rapid, hostile comments directed at Victim
  UI->>Router: POST /api/comments
  
  Router->>Spam: checkSpam(attackerId, text, 'comment')
  Note over Spam: Checks velocity (>10 comments/min) and Jaccard similarity (>85%)
  Spam-->>Router: { is_spam: true, spam_score: 88, action_taken: 'rate_limit' }

  Router->>Bully: recordInteraction(actorId, targetId, text, toxicityScore)
  Bully->>Bully: analyzeBullyingPatterns(targetId, actorId)
  Note over Bully: Detects repeated attacks & targeted hostility within 72hr window
  Bully-->>Router: { has_bullying: true, patterns: ['repeated_attacks', 'targeted_harassment'] }

  Router->>Guardian: recordEvent({ userId: attackerId, eventType: 'CYBERBULLYING', severity: 'high' })
  Router->>Guardian: recordEvent({ userId: attackerId, eventType: 'SPAM_DETECTED', severity: 'high' })

  activate Guardian
  Note over Guardian: Aggregates 14-day sliding window of events<br/>Calculates positive credits vs negative penalties<br/>Old score: 85 (SAFE) -> Score reduced to 34 (HIGH_RISK / RESTRICTED)
  Guardian->>Guardian: getRiskLevel(34) -> "RESTRICTED"
  Guardian->>DB: Upsert public.guardian_scores (score: 34, risk_level: 'RESTRICTED')
  Guardian->>DB: Upsert public.user_restrictions (comment_restricted: true, cooldown: 60s)
  Guardian-->>Router: Updated GuardianScoreRecord
  deactivate Guardian

  Router-->>UI: 403 Forbidden / Rate Limited ("User restricted under AI Guardian policy")
  UI-->>Attacker: Displays Warning Notice & countdown cooldown timer with "Appeal" option
```

---

### 3.4 Sequence Diagram 3: Moderation Appeal & Human-in-the-Loop Review Queue

This diagram maps the lifecycle of a user appeal against a flagged post or account restriction, progressing through triage, admin adjudication, and automated score restitution.

```mermaid
sequenceDiagram
  autonumber
  actor User as Restricted User
  actor Admin as Compliance Admin
  participant UI_User as User Settings / Appeal Modal
  participant UI_Admin as AIDashboardPage (ReviewQueue)
  participant Router as Express Server (server.ts)
  participant Review as ReviewService
  participant Guardian as GuardianService
  participant Rep as ReputationService
  participant DB as Supabase (appeals, review_queue, admin_actions)

  User->>UI_User: Clicks "Appeal Decision", enters justification & evidence
  UI_User->>Router: POST /api/moderation/appeals (analysisId, contentId, reason, appealText)
  Router->>Review: submitAppeal(input)
  
  Review->>DB: Insert into public.moderation_appeals (status: 'PENDING')
  Review->>DB: Insert into public.review_queue (item_type: 'appeal', priority: 'HIGH')
  Review-->>Router: AppealRecord
  Router-->>UI_User: 201 Created ("Appeal submitted for human triage")

  Admin->>UI_Admin: Navigates to AI Dashboard -> "Review Queue"
  UI_Admin->>Router: GET /api/admin/review-queue
  Router->>Review: getReviewQueue({ status: 'PENDING' })
  Review-->>Router: ReviewQueueItem[]
  Router-->>UI_Admin: Renders pending appeals & quarantined media

  Admin->>UI_Admin: Selects appeal, inspects AI confidence score & evidence, clicks "Approve Appeal"
  UI_Admin->>Router: POST /api/admin/appeals/:id/decision { decision: 'APPROVE', notes: 'False positive slang' }
  
  Router->>Review: decideAppeal(appealId, 'APPROVE', adminId, notes)
  activate Review
  Review->>DB: Update moderation_appeals (status: 'APPROVED', resolved_at: now())
  Review->>DB: Update review_queue (status: 'RESOLVED')
  Review->>DB: Insert into public.admin_actions (action: 'APPROVE_APPEAL', adminId, restitution: +25)
  
  Review->>Guardian: recordEvent({ userId, eventType: 'SUCCESSFUL_APPEAL', impact: +25 })
  Guardian->>DB: Lift user_restrictions & restore Guardian Score (34 -> 59)
  
  Review->>Rep: recordEvent({ userId, event: 'ADMIN_ADJUSTMENT', amount: +20 })
  Rep->>DB: Recalculate Reputation Summary
  deactivate Review

  Review-->>Router: Appeal Decision Result
  Router-->>UI_Admin: 200 OK (Queue updated)
  UI_Admin-->>Admin: Displays success banner
```

---

### 3.5 Sequence Diagram 4: Personalized Feed Recommendation & Transparent Explainability

This diagram illustrates how VERIXA provides transparent algorithmic recommendation, calculating multi-factor ranking weights and generating explainable insights for every post served.

```mermaid
sequenceDiagram
  autonumber
  actor Viewer as Active Viewer
  participant UI as HomeFeedPage
  participant Router as Express Server (server.ts)
  participant Feed as FeedService
  participant DB as Supabase DB (Posts, Follows, Likes, Saves)
  participant Ranker as TransparentHeuristicRanker
  participant Telemetry as Data Ledger (recommendation_events)

  Viewer->>UI: Opens Home Feed
  UI->>Router: GET /api/feed/personalized?viewerId=xyz&limit=20
  Router->>Feed: getPersonalizedFeed(viewerId, options)

  activate Feed
  Feed->>DB: Fetch Post Candidates (Approved & safe posts from last 30 days)
  DB-->>Feed: PostCandidate[] (100 candidate posts)

  Feed->>DB: Derive Viewer Context (Followed IDs, liked post IDs, interacted hashtags)
  DB-->>Feed: ViewerContext { followedUserIds, interactedTags, categoryAffinities }

  Feed->>Ranker: rank(candidates, context, weights)
  activate Ranker
  Note over Ranker: Computes weighted factor score for each candidate:<br/>Total = (Follow * 35%) + (Recency * 25%) +<br/>(Engagement * 25%) + (Hashtag * 15%) +<br/>(Safety * 10%)
  Ranker->>Ranker: Sorts posts descending by total_score
  Ranker->>Ranker: Builds RecommendationExplainability factor breakdown per post
  Ranker-->>Feed: RankedPostItem[]
  deactivate Ranker

  Feed->>Telemetry: Log RecommendationEventRecord (rank, total_score, scoring_factors)
  Feed-->>Router: { items: RankedPostItem[], total: 100, strategy: "TransparentHeuristic" }
  deactivate Feed

  Router-->>UI: 200 OK (Ranked posts with explainability metadata)
  UI-->>Viewer: Renders personalized feed

  Viewer->>UI: Clicks "Why was this post recommended?" badge on post #1
  UI-->>Viewer: Displays transparent factor breakdown:<br/>• "You follow this creator (+35 pts)"<br/>• "High engagement in community (+22 pts)"<br/>• "Verified safe content (+10 pts)"
```

---

### 3.6 Activity Diagram: End-to-End Content Ingestion & Multi-Tier Verification Pipeline

This activity flowchart details the decision nodes, branching conditions, and concurrency involved in publishing user-generated content.

```mermaid
flowchart TD
  Start([Author Submits Post / Reel / Story]) --> PII_Check{Client Privacy Check Detects PII?}

  PII_Check -- Yes --> ShowPIIWarning[Display Masked PII Warning to User]
  ShowPIIWarning --> UserPIIChoice{User Chooses to Proceed?}
  UserPIIChoice -- No --> Abort[Discard Post / Allow Edit]
  UserPIIChoice -- Yes --> SubmitGateway[Send to AI Moderation Gateway]

  PII_Check -- No --> SubmitGateway

  SubmitGateway --> RateCheck{Under Rate Limit?\n< 60 req/min}
  RateCheck -- No --> RejectRate[Return 429 Too Many Requests]
  RateCheck -- Yes --> SizeCheck{Payload Within Limit?\n< 25MB}

  SizeCheck -- No --> LogLargePayload[Log PAYLOAD_TOO_LARGE Event] --> RejectSize[Return 400 Bad Request]
  SizeCheck -- Yes --> Normalize[Sanitize, Unescape & Strip Prompt Injections]

  Normalize --> ContentBranch{Content Media Type}

  ContentBranch -- Text / Comment --> TextPipe[Language & Script Detection\n-> Multilingual Toxic Analysis]
  ContentBranch -- Image --> ImgPipe[OCR Embedded Text Extraction\n-> Vision NSFW, Gore & Weapon Scan]
  ContentBranch -- Video / Reel --> VidPipe[Frame Extraction\n-> Scene Change Detection\n-> Deepfake & Indicator Scan]
  ContentBranch -- GIF --> GifPipe[Multi-Frame GIF Burst Decomposition]

  TextPipe --> PolicyEval
  ImgPipe --> PolicyEval
  VidPipe --> PolicyEval
  GifPipe --> PolicyEval

  PolicyEval{Policy Evaluation Engine}

  PolicyEval -- "Toxicity > 70% OR High Violence" --> BlockDecision[Decision: BLOCK\nStatus: REJECTED]
  PolicyEval -- "Deepfake Risk > 85% OR Ambiguous Violation" --> QuarantineDecision[Decision: QUARANTINE\nStatus: REVIEW_REQUIRED]
  PolicyEval -- "Toxicity 40-69% (Mild Slang)" --> WarnDecision[Decision: WARNING\nStatus: ALLOWED with Flag]
  PolicyEval -- "Toxicity < 40% AND Verified Safe" --> AllowDecision[Decision: ALLOW\nStatus: APPROVED]

  BlockDecision --> LogAudit[Persist Immutable Moderation Log]
  QuarantineDecision --> EnqueueReview[Push to Human Review Queue] --> LogAudit
  WarnDecision --> LogAudit
  AllowDecision --> LogAudit

  LogAudit --> GuardianTrigger[Trigger Guardian Risk Scoring Recalculation]
  GuardianTrigger --> FinalBranch{Is Content Allowed?}

  FinalBranch -- No --> ReturnBlock[Return 403 Forbidden to Client\nShow Blocked Modal with Rewrite Suggestion]
  FinalBranch -- Yes --> SaveDatabase[Commit to Supabase Database\nIncrement Author Post Counter Trigger]

  SaveDatabase --> NotifySubscribers[Broadcast via Supabase Realtime WSS]
  NotifySubscribers --> End([Content Live on Public Feed])
```

---

### 3.7 State Machine Diagram 1: Content Moderation Lifecycle

This state machine models the authoritative status transitions of any post, comment, reel, or story submitted to VERIXA.

```mermaid
stateDiagram-v2
  [*] --> PENDING_SCAN : Content Ingested by Gateway

  PENDING_SCAN --> SCANNING : Rate & Size Checks Pass
  PENDING_SCAN --> REJECTED : Payload Exceeds Limits

  state SCANNING {
    [*] --> Normalizing
    Normalizing --> LanguageDetecting
    LanguageDetecting --> MultimodalInferencing
    MultimodalInferencing --> PolicyEvaluating
    PolicyEvaluating --> [*]
  }

  SCANNING --> APPROVED : Safety Confidence Meets Policy
  SCANNING --> WARNING : Mild Toxicity / Borderline Slang
  SCANNING --> REVIEW_REQUIRED : Deepfake Suspicion / High Risk
  SCANNING --> REJECTED : Severe Hate Speech / Violence / NSFW

  WARNING --> APPROVED : Flag Acknowledged by User
  
  REVIEW_REQUIRED --> APPROVED : Admin Overturn / Appeal Upheld
  REVIEW_REQUIRED --> REJECTED : Admin Confirms Violation / Dismissal

  APPROVED --> ARCHIVED : Story 24-Hour Expiry Reached
  APPROVED --> DELETED : Author Self-Deletes
  REJECTED --> [*]
  DELETED --> [*]
  ARCHIVED --> [*]
```

---

### 3.8 State Machine Diagram 2: User Guardian Risk Level & Adaptive Restrictions

This state machine models the behavioral tier transitions of a user under the **AI Guardian Mode Engine**, detailing the actions permitted at each tier and the recovery pathways.

```mermaid
stateDiagram-v2
  [*] --> SAFE : New Account Verified (Score: 100)

  SAFE --> WATCH_LIST : Repeated Mild Toxicity / Spam Velocity (Score: 60-79)
  SAFE --> HIGH_RISK : Isolated High Harassment / NSFW Attempt (Score: 40-59)
  SAFE --> RESTRICTED : Cyberbullying Pattern / Coordinated Attack (Score: 20-39)

  WATCH_LIST --> SAFE : 14-Day Good Behavior Decay (+8 pts) / Positive Participation
  WATCH_LIST --> HIGH_RISK : Accumulation of Negative Signals
  
  HIGH_RISK --> RESTRICTED : Escalating Violations / Unheeded Warnings
  HIGH_RISK --> WATCH_LIST : Successful Appeal (+25 pts) / Sustained Safe Posts

  RESTRICTED --> CRITICAL : Repeated Severe Violations While Restricted (Score: 0-19)
  RESTRICTED --> HIGH_RISK : Appeal Approved by Compliance Admin

  state RESTRICTED {
    [*] --> EnforceCooldowns
    EnforceCooldowns : Post Cooldown (300s)
    EnforceCooldowns : Comment Cooldown (60s)
    EnforceCooldowns : DMs Restricted to Followers
  }

  state CRITICAL {
    [*] --> AccountSuspension
    AccountSuspension : Read-Only Mode
    AccountSuspension : All Publishing Blocked
    AccountSuspension : Permitted Action: Appeal Only
  }

  CRITICAL --> RESTRICTED : Formal Compliance Appeal Granted
  CRITICAL --> [*] : Permanent Account Deletion
```

---

### 3.9 State Machine Diagram 3: Moderation Review & Appeal Lifecycle

This state machine traces the lifecycle of user appeals and review queue items from creation through human-in-the-loop triage and final disposition.

```mermaid
stateDiagram-v2
  [*] --> PENDING : User Submits Appeal / Quarantined by Gateway

  PENDING --> IN_REVIEW : Admin Claims Review Item
  
  state IN_REVIEW {
    [*] --> InspectingEvidence
    InspectingEvidence : Review AI Confidence Scores
    InspectingEvidence : Inspect Extracted Video Frames / Snippets
    InspectingEvidence : Check Actor Prior Violation History
    InspectingEvidence --> Deliberating
  }

  IN_REVIEW --> APPROVED : Admin Approves Appeal / Overturns Moderation
  IN_REVIEW --> REJECTED : Admin Confirms Violation / Upholds Sanction
  IN_REVIEW --> DISMISSED : Duplicate Report / Bad-Faith Appeal

  APPROVED --> RESTITUTION_APPLIED : Automatic Guardian (+25) & Reputation (+20) Restitution
  RESTITUTION_APPLIED --> RESOLVED : User Content Reinstated & Unhidden

  REJECTED --> SANCTION_LOGGED : Immutable Admin Audit Record Written
  SANCTION_LOGGED --> RESOLVED : User Notified of Final Decision

  DISMISSED --> RESOLVED : Closed Without Score Alteration

  RESOLVED --> [*]
```

---

## 4. Subsystem Mapping Matrix

The following matrix provides a reference mapping across VERIXA's primary architectural subsystems, their implementation files, database tables, and corresponding UML diagrams:

| Subsystem | Key Implementation Files | Supabase DB Tables | Primary UML Reference |
| :--- | :--- | :--- | :--- |
| **AI Moderation Gateway** | `server/moderation/moderationGateway.ts`<br/>`server/moderation/normalizer.ts`<br/>`server/moderation/languageDetector.ts` | `public.moderation_logs` | **Diagram 2.1, 2.3, 3.2, 3.6, 3.7** |
| **Media Safety & Vision** | `server/moderation/mediaAnalyzer.ts`<br/>`server/moderation/videoSafetyEngine.ts`<br/>`server/moderation/gifExtractor.ts` | `public.posts`, `public.reels`, `public.stories` | **Diagram 2.1, 2.3, 3.6** |
| **Policy & Decision Engine** | `server/moderation/policyEngine.ts`<br/>`server/moderation/secondarySafetyRules.ts` | `public.moderation_logs` | **Diagram 2.3, 3.2, 3.6, 3.7** |
| **AI Guardian Risk Engine** | `server/moderation/guardianService.ts` | `public.guardian_scores`<br/>`public.guardian_events`<br/>`public.user_restrictions` | **Diagram 2.3, 2.4, 3.3, 3.8** |
| **Behavioral Intelligence** | `server/moderation/cyberbullyingService.ts`<br/>`server/moderation/spamService.ts`<br/>`server/moderation/fakeAccountService.ts` | `public.cyberbullying_events`<br/>`public.spam_events` | **Diagram 2.1, 2.3, 3.3** |
| **Privacy & PII Defense** | `server/moderation/privacyScanner.ts`<br/>`src/lib/privacyScanner.ts` | Transient / Masked Logs | **Diagram 2.1, 3.2, 3.6** |
| **Human Review & Appeals** | `server/moderation/reviewService.ts`<br/>`src/pages/AIDashboardPage.tsx` | `public.moderation_appeals`<br/>`public.review_queue`<br/>`public.admin_actions`<br/>`public.reports` | **Diagram 2.3, 2.4, 3.4, 3.9** |
| **Transparent Feed Engine** | `server/feed/feedService.ts`<br/>`server/feed/rankingStrategy.ts`<br/>`src/pages/HomeFeedPage.tsx` | `public.user_interaction_events`<br/>`public.served_recommendation_events` | **Diagram 2.1, 2.3, 2.4, 3.5** |
| **User & Social Core** | `src/context/AppContext.tsx`<br/>`src/lib/supabaseServices.ts` | `public.profiles`, `public.posts`<br/>`public.comments`, `public.likes`<br/>`public.follows`, `public.messages` | **Diagram 2.1, 2.2, 2.3, 2.4** |
| **Sentinel AI Assistant** | `server.ts` (`/api/ai-assistant`)<br/>`src/components/AIFloatingSentinel.tsx`<br/>`src/pages/SentinelAIChatbotPage.tsx` | Gemini API Session / Transient | **Diagram 2.1, 2.5, 3.1** |

---
*End of VERIXA Unified Modeling Language (UML 2.5) System Specifications.*

# Project MatchPoint — Architecture Diagram Source (v1.0)

These Mermaid diagrams are source-controlled architecture artefacts. GitHub can render Mermaid in supported Markdown views.

## 1. System context

```mermaid
flowchart LR
    Player[Player / Parent or Guardian]
    Admin[Club Administrator]
    Organiser[Session Organiser]
    App[MatchPoint Web Application]
    Auth[Identity Provider]
    Backend[MatchPoint Backend API]
    DB[(PostgreSQL)]
    Files[(Object Storage)]
    Notify[Email / Notification Provider]
    Player --> App
    Admin --> App
    Organiser --> App
    App -->|HTTPS API calls| Backend
    App -->|Sign-in flow| Auth
    Backend -->|Verify identity / authorise| Auth
    Backend -->|Queries and transactions| DB
    Backend -->|Authorised file operations| Files
    Backend -->|Notifications| Notify
```

## 2. Three-layer application architecture

```mermaid
flowchart TB
    subgraph Presentation["Presentation Layer"]
        Web[Responsive Web UI]
    end
    subgraph Application["Application / Business Logic Layer"]
        API[Backend API]
        AuthZ[Authorisation and club-scope checks]
        Services[Domain services: bookings, waitlist, allocation, results]
        Jobs[Scheduled/background jobs]
        API --> AuthZ
        AuthZ --> Services
        Jobs --> Services
    end
    subgraph Data["Data Layer"]
        Repo[Data access / repositories]
        PG[(PostgreSQL)]
        Repo --> PG
    end
    Web -->|HTTPS + authenticated request| API
    Services --> Repo
```

## 3. Session booking sequence

```mermaid
sequenceDiagram
    actor Player
    participant UI as MatchPoint UI
    participant API as Backend API
    participant DB as PostgreSQL
    Player->>UI: Request to book a session
    UI->>API: POST booking request + access token
    API->>API: Validate identity, club role and booking policy
    API->>DB: Begin transaction; check capacity and eligibility
    DB-->>API: Current state / constraint outcome
    API->>DB: Create registration or waitlist entry
    API->>DB: Commit transaction
    API-->>UI: Confirmed / waitlisted / rejected
    UI-->>Player: Display outcome
```

## 4. Deployment topology (provider-neutral)

```mermaid
flowchart TB
    Browser[User browser]
    Hosting[Static web hosting / CDN]
    APIHost[Backend API hosting]
    Secrets[Server-side secret store]
    Auth[Managed authentication]
    PG[(Managed PostgreSQL)]
    Storage[(Object storage)]
    Email[Email provider]
    Repo[Private GitHub repository]
    CI[CI/CD pipeline]
    Browser --> Hosting
    Browser -->|HTTPS API| APIHost
    APIHost --> Secrets
    APIHost --> Auth
    APIHost --> PG
    APIHost --> Storage
    APIHost --> Email
    Repo --> CI
    CI --> Hosting
    CI --> APIHost
```

## 5. Key security boundaries

```mermaid
flowchart LR
    subgraph Public["Public / untrusted client"]
        UI[Browser UI]
    end
    subgraph Server["Trusted server environment"]
        API[Backend API]
        Secret[Privileged credentials]
    end
    subgraph DataServices["Protected data services"]
        PG[(PostgreSQL)]
        Auth[Identity provider]
        Files[(Object storage)]
    end
    UI -->|Public client config + user token only| API
    API --> Secret
    API --> PG
    API --> Auth
    API --> Files
    UI -. "Never expose DB password / service-role secret" .-> Secret
```

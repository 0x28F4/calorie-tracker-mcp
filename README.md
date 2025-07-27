# Calorie Tracker MCP - Complete Project Plan

## 📋 Implementation Progress

### Phase 1: Minimum Viable MCP Server ✅

#### Step 1: Project Setup & Basic MCP Server ✅
- [x] Initialize TypeScript project
- [x] Install MCP SDK and SQLite dependencies  
- [x] Configure TypeScript with modern settings
- [x] Set up ESLint and Prettier
- [x] Create project directory structure
- [x] Add development scripts and tooling
- [x] Create configuration system (app vs user settings)
- [x] Implement basic logging infrastructure
- [x] Create MCP server with stdio transport
- [x] Add hello tool for testing
- [x] Set up MCP Inspector for debugging

#### Step 2: Core Tools & Database
- [ ] Design and implement SQLite database schema
- [ ] Create database initialization and migration system
- [ ] Implement `add_meal` MCP tool
- [ ] Implement `check_weight` MCP tool  
- [ ] Implement `get_today_summary` MCP tool
- [ ] Add input validation and error handling
- [ ] Create database wrapper with proper transactions

#### Step 3: Testing & Local Deployment
- [ ] Create test database with sample data
- [ ] Write manual test scripts for each tool
- [ ] Test with Claude Desktop configuration
- [ ] Test with MCP Inspector
- [ ] Fix any protocol issues
- [ ] Document setup process

### Phase 2: Enhanced Tracking & CRUD Operations

#### Extended Food Tracking
- [ ] Implement `list_recent_meals` tool
- [ ] Implement `update_meal` tool
- [ ] Implement `delete_meal` tool
- [ ] Add database indexes for performance
- [ ] Add meal ID support for editing

#### Search & Macros
- [ ] Implement `search_food` tool with fuzzy matching
- [ ] Extend database schema for macronutrients
- [ ] Update `add_meal` to accept optional macros
- [ ] Update summary tools to include macro totals
- [ ] Add macro targets to user settings

#### Data Validation & Error Handling
- [ ] Comprehensive input validation for all tools
- [ ] Better error messages for users
- [ ] Transaction support for data integrity
- [ ] Rate limiting considerations
- [ ] Logging improvements

#### Remote Access Setup
- [ ] Research and choose remote transport (SSE vs HTTP)
- [ ] Implement chosen transport alongside stdio
- [ ] Add authentication (API key)
- [ ] Test remote access locally
- [ ] Document remote setup process

### Phase 3: Analytics Foundation

#### Basic Analytics
- [ ] Implement enhanced `get_daily_summary` (any date)
- [ ] Implement `get_weight_trend` with moving averages
- [ ] Implement `get_date_range_stats` for custom periods
- [ ] Create analytics service layer
- [ ] Add result caching for performance
- [ ] Handle missing data gracefully

#### Import/Export
- [ ] Define CSV format specification
- [ ] Implement `import_csv` tool with validation
- [ ] Implement `export_csv` tool with multiple formats
- [ ] Support incremental imports
- [ ] Add error reporting for imports

#### Performance & Testing
- [ ] Add database indexes for analytics queries
- [ ] Implement query optimization
- [ ] Create performance benchmarks
- [ ] Comprehensive testing suite
- [ ] Documentation updates

### Phase 4: Advanced Analytics

#### High-Level Goals
- [ ] Metabolic rate calculation from historical data
- [ ] Weight prediction models
- [ ] Deficit accuracy tracking
- [ ] Weekly/monthly summary reports

#### Key Tools
- [ ] Implement `calculate_metabolic_rate`
- [ ] Implement `predict_weight_loss`
- [ ] Implement `get_analytics_report`

### Phase 5: Production Deployment

#### Deployment Tasks
- [ ] Choose hosting platform (see hosting options below)
- [ ] Set up CI/CD pipeline
- [ ] Implement backup strategy
- [ ] Monitoring and alerting
- [ ] Security hardening

### Phase 6: UI & Integrations

#### Future Enhancements
- [ ] Optional web dashboard
- [ ] Google Sheets direct integration
- [ ] Mobile app considerations
- [ ] Third-party fitness app sync

---

## 🎯 Project Overview

A calorie tracking system designed as a first-class citizen for chat agents (like Claude), featuring MCP (Model Context Protocol) integration for seamless AI assistant interaction, persistent storage, and comprehensive analytics.

## 📋 Core Requirements

### 1. MCP Server Features
- **Remote MCP Server**: Accessible from anywhere (not just localhost)
- **Chat-First Design**: Optimized for interaction via Claude and other AI assistants
- **Simple API**: Add meals/ingredients to storage via MCP tools
- **Persistent Storage**: Database for long-term data retention

### 2. Tracking Capabilities
- **Calorie Tracking**: Log meals with calorie information
- **Weight Check-ins**: Record daily weight measurements
- **Historical Data Import**: Support CSV imports for existing data

### 3. Analytics Features
- **Daily Metrics**:
  - Total calories consumed
  - Caloric deficit/surplus
  - Weight measurements
  
- **Trend Analysis**:
  - Moving average weight (configurable N days)
  - Daily weight changes
  - Average/median weight changes over N days
  - Total weight loss over time periods
  
- **Advanced Analytics**:
  - Cumulative deficit calculation over date ranges
  - Metabolic rate estimation based on weight loss vs deficit
  - Ability to update metabolic rate from calculations
  
- **Export Options**:
  - Google Sheets integration for visualization
  - CSV export capabilities

## 🛠 Technology Stack

### Backend (MCP Server)
- **Language**: TypeScript/Node.js
  - Excellent MCP SDK support
  - Strong ecosystem for web services
  
- **Framework**: Express.js
  - Minimal and flexible
  - Direct control for MCP integration
  - Simple WebSocket handling
  
- **Database**: SQLite
  - Simple file-based database
  - No separate database server needed
  - Perfect for single-user application
  - Easy backup (just copy the file)
  
- **MCP Integration**: @modelcontextprotocol/sdk
  - Official MCP SDK for TypeScript
  - Stable, well-documented, and officially supported
  - Better ecosystem maturity than Go alternatives

### Local Development
- **Requirements**: Node.js, npm/yarn
- **Database**: SQLite file in project directory
- **MCP Testing**: Claude Desktop app for local testing
- **Hot Reload**: Nodemon for development
- **Configuration**: Simple config file for:
  - User ID (hard-coded initially)
  - Timezone setting
  - Default metabolic rate
- **Build**: Simple `go build` creates single binary

### Hosting Environment
- Multiple options to explore (see hosting options below)
- Key requirement: WebSocket support for MCP protocol

### Analytics & Export
- **CSV Export**: Primary export method
- **Report Generation**: Text-based analytics reports
- **Google Sheets**: Manual import via CSV (API integration later)
- **Scheduled Tasks**: Node-cron for automation

## 🏗 Architecture Design

```
┌─────────────────┐     ┌──────────────────┐
│  Claude/Chat    │────▶│   MCP Server     │
│    Agents       │     │  (TypeScript)    │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │    SQLite        │
                        │   Database       │
                        └────────┬─────────┘
                                 │
                    ┌────────────┴───────────┐
                    │                        │
                    ▼                        ▼
            ┌──────────────┐        ┌──────────────┐
            │ Google Sheets│        │  Future UI   │
            │   Export     │        │  (Optional)  │
            └──────────────┘        └──────────────┘
```

## 📊 Data Model Overview

The system will track:
- **Food Entries**: Meals with calories and optional macros (scoped by user_id)
- **Weight Entries**: Daily weight check-ins (scoped by user_id)
- **User Settings**: Metabolic rate and preferences
- **Analytics Cache**: Pre-computed daily summaries for performance

All data will be scoped by user_id from day one, even though we'll start with a single hard-coded user.

## 🔧 MCP Tools Overview

### Core Tracking Tools
- **add_meal**: Log a meal with calories and optional macros
- **check_weight**: Record daily weight measurement
- **get_today_summary**: View today's calorie intake and deficit

### Meal Management
- **list_recent_meals**: View recent food entries
- **update_meal**: Edit existing meal entries
- **delete_meal**: Remove meal entries
- **search_food**: Find previously logged meals

### Analytics Tools
- **get_daily_summary**: View calories and deficit for any date
- **get_weight_trend**: Calculate moving averages over N days
- **get_date_range_stats**: Comprehensive stats for date ranges
- **calculate_metabolic_rate**: Estimate metabolic rate from weight loss vs deficit
- **update_metabolic_rate**: Manually set metabolic rate

### Import/Export Tools
- **import_csv**: Import historical data from CSV
- **export_csv**: Export data to CSV format
- **generate_report**: Create formatted analytics reports
- **export_to_sheets**: (Future) Direct Google Sheets integration

## 🧪 Testing Strategy

### Unit Tests
- Database operations
- Analytics calculations
- MCP tool handlers

### Integration Tests
- MCP protocol compliance
- End-to-end data flow
- Export functionality

### Manual Testing Checklist
1. [ ] Add meals via Claude
2. [ ] Check daily summaries
3. [ ] Record weight entries
4. [ ] View trends over different periods
5. [ ] Calculate metabolic rate
6. [ ] Import CSV data
7. [ ] Export to Google Sheets
8. [ ] Verify all calculations

## 🚦 Success Metrics

1. **Functionality**: All MCP tools work via Claude
2. **Performance**: Analytics queries < 100ms
3. **Reliability**: 99.9% uptime
4. **Accuracy**: Calculations match manual verification
5. **Usability**: Natural conversation flow with Claude

## 📝 Next Steps

1. Set up development environment
2. Create GitHub repository
3. Initialize TypeScript project with MCP SDK
4. Set up SQLite database
5. Begin Stage 1 implementation

## 💡 Why TypeScript?

We chose TypeScript over Go because the official MCP SDK is TypeScript-first, providing better stability, documentation, and long-term support for building MCP servers.

## ✅ Decisions

1. **Multi-user support**: Yes, but simplified
   - Hard-code user ID in MCP server config initially
   - Data model supports user_id from the start
   - No user management/auth system needed initially
   
2. **Food database**: Defer to later
   - Could be implemented as another MCP tool later
   - Focus on manual entry first
   
3. **Timezone handling**: Hard-code in config
   - Set timezone in MCP server configuration
   - Use for all date/time operations
   - Can enhance later if needed
   
4. **Backup strategy**: Manual for now
   - SQLite file can be copied manually
   - Automated backups can come later
   
5. **Google Sheets integration**: Start simple
   - Initial version: CSV export only
   - Users can manually import to Sheets
   - Direct Sheets API integration in later phase

---

## 🌐 Hosting Options

The MCP server needs to be accessible from anywhere (not just localhost) to work with Claude and other chat agents. Key requirements:
- WebSocket support for MCP protocol
- HTTPS for secure connections
- Persistent storage for SQLite database
- Reasonable uptime for personal use

### Option 1: Home Server

**Pros:**
- Complete control over hardware and software
- No monthly hosting fees
- Data stays on your own hardware
- Can use existing computer/Raspberry Pi

**Cons:**
- Need to handle dynamic IP or get static IP
- Security concerns with exposing home network
- Uptime depends on home internet/power
- Need to manage SSL certificates

**Setup Requirements:**
1. **Dynamic DNS Service** (DuckDNS, No-IP)
   - Maps dynamic home IP to stable domain
   - Free options available
   
2. **Port Forwarding**
   - Forward port 443 (HTTPS) to server
   - Configure router firewall rules
   
3. **Reverse Proxy** (Nginx/Caddy)
   - Handle SSL termination
   - WebSocket proxy support
   - Automatic Let's Encrypt certificates
   
4. **Security Hardening**
   - Fail2ban for brute force protection
   - API key authentication
   - Firewall rules
   - Regular security updates

**Example Setup with Tailscale:**
- Use Tailscale for secure access without port forwarding
- Access server via Tailscale network from anywhere
- No public internet exposure
- Built-in encryption

### Option 2: VPS (Virtual Private Server)

**Providers:**
- **DigitalOcean**: $4-6/month droplets
- **Linode**: Similar pricing to DO
- **Hetzner**: EU-based, very competitive pricing
- **Vultr**: Good global coverage

**Pros:**
- Full control over environment
- Static IP included
- Professional uptime
- Can host multiple services

**Cons:**
- Monthly cost
- Need to manage server security
- Responsible for backups
- More complex setup

### Option 3: Platform-as-a-Service

**Free/Low-Cost Options:**

**Fly.io**
- Free tier with 3 shared VMs
- Built-in SSL
- Good for small apps
- Persistent volumes for SQLite

**Railway**
- Simple deployment
- Free trial credits
- WebSocket support
- Volume storage available

**Render**
- Free tier available
- Automatic SSL
- Persistent disks (paid)
- Good DX

**Pros:**
- Managed infrastructure
- Automatic SSL
- Easy deployment from GitHub
- Built-in monitoring

**Cons:**
- Less control
- Potential cold starts on free tiers
- Storage costs extra
- Vendor lock-in

### Option 4: Serverless + Cloud Storage

**Architecture:**
- AWS Lambda/Vercel Functions for API
- AWS RDS/PlanetScale for database
- WebSocket via AWS API Gateway

**Pros:**
- Scales to zero
- Pay per use
- High availability

**Cons:**
- Complex MCP WebSocket handling
- Higher latency
- More expensive at scale
- Not ideal for SQLite

### Option 5: Container Hosting

**Google Cloud Run**
- Serverless containers
- Scales to zero
- Persistent storage via Cloud SQL

**AWS App Runner**
- Similar to Cloud Run
- Automatic scaling
- Container-based

### Recommendation for Your Use Case

Given the requirements:
1. **For Simplicity**: Start with Fly.io or Railway
   - Easy deployment
   - Free tier sufficient for personal use
   - SQLite-friendly with persistent volumes
   
2. **For Control**: Home server with Tailscale
   - No ongoing costs
   - Complete privacy
   - Easy setup with Tailscale

3. **For Reliability**: Small VPS ($5/month)
   - Professional uptime
   - Full control
   - Can grow with needs

### Quick Start Path

1. **Local Development First**
   - Get everything working locally
   - Test with Claude Desktop
   
2. **Tailscale for Remote Access**
   - Install Tailscale on dev machine
   - Access from anywhere securely
   - No port forwarding needed
   
3. **Deploy to Fly.io**
   - When ready for "production"
   - Simple deployment
   - Minimal configuration

### Security Considerations

Regardless of hosting choice:
- Always use HTTPS
- Implement API key authentication
- Regular backups of SQLite database
- Monitor access logs
- Keep dependencies updated

---

This plan addresses all requirements from the original prompt:
- ✅ MCP integration for Claude interaction
- ✅ Remote MCP server architecture
- ✅ Meal and weight tracking
- ✅ Persistent storage
- ✅ Google Sheets export
- ✅ Comprehensive analytics (deficit, moving averages, metabolic rate)
- ✅ CSV import capabilities
- ✅ Date range selections
- ✅ Staged development approach
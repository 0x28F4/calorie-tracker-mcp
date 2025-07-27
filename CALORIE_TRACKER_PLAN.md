# Calorie Tracker with MCP Integration - Project Plan

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

### Local Development
- **Requirements**: Node.js, npm/yarn
- **Database**: SQLite file in project directory
- **MCP Testing**: Claude Desktop app for local testing
- **Hot Reload**: Nodemon for development
- **Configuration**: Simple config file for:
  - User ID (hard-coded initially)
  - Timezone setting
  - Default metabolic rate

### Hosting Environment
- Multiple options to explore (see separate hosting document)
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

## 🚀 Development Stages

### Stage 1: Basic MCP Server (Week 1)
**Goal**: Minimal viable MCP server that can receive and store data

**Tasks**:
1. Set up TypeScript project with MCP SDK
2. Create basic Express server
3. Implement MCP tools:
   - `add_meal`: Log food with calories
   - `check_weight`: Record weight
   - `get_today_summary`: View today's intake
4. Set up PostgreSQL with basic schema
5. Deploy to Railway/Render

**Testing**: Use Claude Desktop to interact with MCP server

### Stage 2: Enhanced Tracking (Week 2)
**Goal**: Full CRUD operations and better meal tracking

**Tasks**:
1. Add more MCP tools:
   - `list_recent_meals`: View recent entries
   - `update_meal`: Edit existing entries
   - `delete_meal`: Remove entries
   - `search_food`: Search previous meals
2. Add macronutrient tracking (protein, carbs, fat)
3. Implement user authentication (API key)
4. Add data validation and error handling

**Testing**: Create test scenarios for all CRUD operations

### Stage 3: Basic Analytics (Week 3)
**Goal**: Core analytics functionality

**Tasks**:
1. Implement analytics MCP tools:
   - `get_daily_summary`: Calories and deficit for any date
   - `get_weight_trend`: Moving average calculations
   - `get_date_range_stats`: Stats for custom periods
2. Create analytics calculation engine
3. Add caching for performance
4. Implement CSV import tool

**Testing**: Import historical data and verify calculations

### Stage 4: Advanced Analytics (Week 4)
**Goal**: Metabolic rate calculations and predictions

**Tasks**:
1. Implement advanced tools:
   - `calculate_metabolic_rate`: Based on deficit vs weight loss
   - `update_metabolic_rate`: Set custom rate
   - `predict_weight_loss`: Based on current trends
2. Add moving average calculations
3. Implement median calculations
4. Create date range selectors

**Testing**: Compare calculations with manual spreadsheet

### Stage 5: Export & Integration (Week 5)
**Goal**: CSV export functionality (Google Sheets later)

**Tasks**:
1. Implement CSV export tools:
   - `export_csv`: Export data to CSV format
   - `generate_report`: Create formatted text reports
2. Support different export formats:
   - Daily summaries
   - Date range reports
   - Full data export
3. Create example import templates for Google Sheets
4. Document manual import process

**Testing**: Export data and verify CSV imports correctly into Google Sheets

### Stage 6: Polish & Future UI (Week 6)
**Goal**: Production-ready system with optional web UI

**Tasks**:
1. Add comprehensive logging
2. Implement rate limiting
3. Create backup/restore tools
4. Optional: Basic web dashboard
5. Documentation and deployment guide

**Testing**: Full end-to-end testing with real usage patterns

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
4. Set up PostgreSQL database
5. Begin Stage 1 implementation

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
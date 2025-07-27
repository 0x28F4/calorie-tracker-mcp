# Calorie Tracker MCP - Detailed Implementation Plan

## Overview
This document provides a detailed implementation roadmap for the MCP calorie tracker, with high resolution for early phases and broader strokes for future development.

## Phase 1: Minimum Viable MCP Server

### Step 1: Project Setup & Basic MCP Server

**Environment Setup**
1. Initialize TypeScript project
   ```bash
   npm init -y
   npm install --save-dev typescript @types/node ts-node nodemon
   npm install @modelcontextprotocol/sdk sqlite3 @types/sqlite3
   ```

2. Configure TypeScript (`tsconfig.json`)
   - Target ES2022
   - Module: CommonJS
   - Strict mode enabled
   - Source maps for debugging

3. Set up project structure:
   ```
   calorie-tracker-mcp/
   ├── src/
   │   ├── index.ts           # MCP server entry point
   │   ├── tools/             # MCP tool implementations
   │   ├── db/                # Database layer
   │   └── config/            # Configuration
   ├── data/                  # SQLite database location
   ├── tests/                 # Test files
   └── claude_desktop_config/ # Example config for testing
   ```

**Basic MCP Server**
1. Create minimal MCP server with stdio transport
2. Implement server initialization and lifecycle
3. Add basic logging system
4. Create configuration system:
   ```typescript
   interface Config {
     userId: number;
     timezone: string;
     defaultMetabolicRate: number;
     databasePath: string;
   }
   ```

### Step 2: Core Tools & Database

**SQLite Setup**
1. Design initial database schema:
   ```sql
   -- meals table
   CREATE TABLE meals (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     meal_name TEXT NOT NULL,
     calories INTEGER NOT NULL,
     logged_at DATETIME NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   
   -- weights table
   CREATE TABLE weights (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     weight REAL NOT NULL,
     logged_at DATE NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(user_id, logged_at)
   );
   ```

2. Create database initialization script
3. Implement database connection wrapper
4. Add basic migration system for future schema changes

**First MCP Tools**
1. Implement `add_meal` tool:
   - Input validation (calories > 0, meal_name not empty)
   - Database insertion
   - Return confirmation with meal ID

2. Implement `check_weight` tool:
   - Input validation (weight > 0)
   - Handle duplicate dates (update vs error)
   - Return confirmation

3. Implement `get_today_summary` tool:
   - Query today's meals
   - Calculate total calories
   - Include deficit calculation (hardcoded metabolic rate)
   - Return formatted summary

### Step 3: Testing & Local Deployment

**Testing Setup**
1. Create test database with sample data
2. Write manual test scripts for each tool
3. Set up Claude Desktop configuration:
   ```json
   {
     "mcpServers": {
       "calorie-tracker": {
         "command": "node",
         "args": ["dist/index.js"],
         "cwd": "/path/to/calorie-tracker-mcp"
       }
     }
   }
   ```

**Local Testing & Refinement**
1. Test with Claude Desktop
2. Fix any protocol issues
3. Improve error messages and user feedback
4. Document setup process
5. Create README with quick start guide

**Deliverables:**
- Working MCP server with 3 core tools
- Local SQLite database
- Tested with Claude Desktop
- Basic documentation

## Phase 2: Enhanced Tracking & CRUD Operations

### Extended Food Tracking

**Tool Implementations:**
1. `list_recent_meals` tool:
   - Parameter: days (default 7)
   - Pagination support (limit/offset)
   - Include meal IDs for editing

2. `update_meal` tool:
   - Update by meal ID
   - Partial updates supported
   - Validation for ownership (user_id)

3. `delete_meal` tool:
   - Soft delete vs hard delete decision
   - Confirmation requirement
   - Return deleted meal details

**Database Updates:**
- Add indexes for common queries
- Add `updated_at` timestamp
- Consider soft delete column

### Search & Macros

**Search Functionality**
1. `search_food` tool:
   - Search by meal name (fuzzy matching)
   - Search by date range
   - Search by calorie range
   - Return structured results

**Macronutrient Support**
1. Extend database schema:
   ```sql
   ALTER TABLE meals ADD COLUMN protein REAL;
   ALTER TABLE meals ADD COLUMN carbs REAL;
   ALTER TABLE meals ADD COLUMN fat REAL;
   ```

2. Update `add_meal` to accept optional macros
3. Update summary tools to include macro totals
4. Add macro targets to config

### Data Validation & Error Handling

**Focus Areas:**
1. Comprehensive input validation
2. Better error messages for users
3. Transaction support for data integrity
4. Rate limiting considerations
5. Logging improvements

### Remote Access Setup

**Tasks:**
1. Research and choose remote transport (SSE vs HTTP)
2. Implement chosen transport alongside stdio
3. Add authentication (API key)
4. Test remote access locally
5. Document remote setup process

**Deliverables:**
- Full CRUD operations for meals
- Search functionality
- Macro tracking
- Remote access capability

## Phase 3: Analytics Foundation

### Basic Analytics

**Core Analytics Tools:**
1. `get_daily_summary` (enhanced):
   - Any date, not just today
   - Include all metrics
   - Cache results for performance

2. `get_weight_trend`:
   - Moving average calculation
   - Configurable window (N days)
   - Include change metrics

3. `get_date_range_stats`:
   - Total calories/deficit for period
   - Average daily intake
   - Weight change over period

**Implementation Details:**
- Create analytics service layer
- Implement efficient SQL queries
- Add result caching
- Handle missing data gracefully

### Import/Export

**CSV Import:**
1. Define CSV format specification
2. Implement `import_csv` tool
3. Add validation and error reporting
4. Support incremental imports

**CSV Export:**
1. Implement `export_csv` tool
2. Multiple export formats:
   - Full data dump
   - Daily summaries
   - Date range reports

### Performance & Testing

**Tasks:**
- Add database indexes
- Implement query optimization
- Create performance benchmarks
- Comprehensive testing suite
- Documentation updates

## Phase 4: Advanced Analytics

### High-Level Goals:
- Metabolic rate calculation from historical data
- Weight prediction models
- Deficit accuracy tracking
- Weekly/monthly summary reports

### Key Tools:
- `calculate_metabolic_rate`
- `predict_weight_loss`
- `get_analytics_report`

## Phase 5: Production Deployment

### Deployment Tasks:
- Choose hosting platform
- Set up CI/CD pipeline
- Implement backup strategy
- Monitoring and alerting
- Security hardening

## Phase 6: UI & Integrations

### Future Enhancements:
- Optional web dashboard
- Google Sheets direct integration
- Mobile app considerations
- Third-party fitness app sync

## Success Criteria by Phase

### Phase 1 Success:
- [ ] Can add meals via Claude
- [ ] Can check weight via Claude
- [ ] Can see today's summary
- [ ] Data persists between sessions

### Phase 2 Success:
- [ ] Can search and edit past meals
- [ ] Can track macros
- [ ] Can access remotely
- [ ] Error handling is user-friendly

### Phase 3 Success:
- [ ] Can view trends over time
- [ ] Can import historical data
- [ ] Can export for analysis
- [ ] Performance is acceptable

## Technical Decisions Log

### Why SQLite?
- Simple file-based storage
- No separate database server
- Easy backup (copy file)
- Sufficient for single-user app

### Why Stdio First?
- Simplest MCP transport
- Easy local testing
- No network complexity initially
- Can add remote transport later

### Why Hard-coded Config?
- Faster initial development
- No auth complexity early
- Can add user management later
- Focus on core functionality first
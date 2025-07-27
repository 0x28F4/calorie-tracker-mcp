# Development Guidelines

This is a TypeScript-based MCP (Model Context Protocol) server for calorie tracking via Claude. The project emphasizes functional programming patterns over object-oriented approaches.

## Pre-Commit Workflow

**ALWAYS run these commands before committing:**

```bash
npm run check-all
```

Or run individually:
```bash
npm run type-check    # TypeScript compilation check
npm run lint:check    # ESLint validation
npm run format:check  # Prettier formatting check
```

**Auto-fix issues before committing:**
```bash
npm run fix-all
```

Or run individually:
```bash
npm run lint     # Fix linting issues automatically
npm run format   # Format code with Prettier
```

## Build & Development Commands

```bash
npm run dev         # Start development server with hot reload
npm run build       # Compile TypeScript to JavaScript
npm run start       # Run compiled JavaScript
npm run clean       # Remove dist/ directory
npm run type-check  # TypeScript compilation without emit
```

## Code Style Guidelines

### Programming Paradigm
- **Prefer functional programming** over object-oriented programming
- Use pure functions whenever possible
- Avoid classes unless absolutely necessary
- Favor composition over inheritance
- Use immutable data structures where practical

### TypeScript Best Practices
- Always provide explicit return types for functions
- Use strict TypeScript settings (already configured)
- Prefer `const` over `let`, avoid `var`
- Use type guards for runtime type checking
- Leverage discriminated unions for state management

### Function Design
```typescript
// Good: Pure function with explicit types
function calculateDeficit(calories: number, metabolicRate: number): number {
  return metabolicRate - calories;
}

// Good: Functional composition
const processData = pipe(
  validateInput,
  transformData,
  saveToDatabase
);

// Avoid: Classes when functions suffice
// Bad: class CalorieCalculator { ... }
```

### Error Handling
- Use Result/Either patterns instead of throwing exceptions
- Return errors as values when possible
- Use type-safe error handling with discriminated unions

```typescript
type Result<T, E> = { success: true; data: T } | { success: false; error: E };

function parseCalories(input: string): Result<number, string> {
  const parsed = parseInt(input, 10);
  if (isNaN(parsed)) {
    return { success: false, error: 'Invalid number format' };
  }
  return { success: true, data: parsed };
}
```

### Naming Conventions
- Use descriptive function names: `addMealEntry` not `add`
- Prefer verbs for functions: `calculateDeficit`, `validateInput`
- Use camelCase for variables and functions
- Use PascalCase for types and interfaces
- Use SCREAMING_SNAKE_CASE for constants

## File Organization

```
src/
├── tools/          # MCP tool implementations
├── db/             # Database layer (SQLite)
├── config/         # Configuration management
├── types/          # TypeScript type definitions
└── utils/          # Pure utility functions
```

## Git Workflow

1. **Before each commit**, run the pre-commit checks:
   ```bash
   npm run check-all
   ```

2. **If checks fail**, fix issues automatically:
   ```bash
   npm run fix-all
   ```

3. **Commit with descriptive messages**:
   ```bash
   git commit -m "feat: add meal tracking MCP tool"
   ```

4. **Keep commits small and focused** - one feature/fix per commit

## Libraries Used

### Core Dependencies
- **@modelcontextprotocol/sdk** - Official MCP SDK for TypeScript
- **sqlite3** - SQLite database driver
- **@types/sqlite3** - TypeScript definitions for sqlite3

### Development Dependencies
- **TypeScript** - Type-safe JavaScript
- **ESLint** - Code linting with TypeScript support
- **Prettier** - Code formatting
- **nodemon** - Development hot reload
- **ts-node** - TypeScript execution for development

### Planned Dependencies
- **zod** - Runtime type validation and schema definition
- **date-fns** - Functional date utility library
- **ramda** or **lodash/fp** - Functional programming utilities

## MCP Development Guidelines

### Tool Implementation
- Each MCP tool should be a pure function when possible
- Keep tool handlers focused on single responsibilities
- Use proper TypeScript types for tool parameters and responses
- Handle errors gracefully and return user-friendly messages

### Database Operations
- Use functional composition for database queries
- Implement proper transaction handling
- Always validate input before database operations
- Use prepared statements to prevent SQL injection

### Testing Strategy
- Write unit tests for pure functions
- Test MCP tools in isolation
- Use integration tests for database operations
- Mock external dependencies in tests

## Common Patterns

### Configuration Management
```typescript
interface Config {
  readonly userId: number;
  readonly timezone: string;
  readonly defaultMetabolicRate: number;
  readonly databasePath: string;
}

const loadConfig = (): Config => ({ /* ... */ });
```

### Database Operations
```typescript
type DbResult<T> = Promise<Result<T, DatabaseError>>;

const insertMeal = (meal: MealData): DbResult<number> => {
  // Implementation
};
```

### MCP Tool Structure
```typescript
interface ToolResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly message: string;
}

const addMealTool = async (params: AddMealParams): Promise<ToolResponse<MealEntry>> => {
  // Validate input
  // Process data
  // Return result
};
```

## Important Notes

- **No console.log()** in production code - use console.warn() or console.error() for important messages
- **Always handle async operations** with proper error handling
- **Prefer explicit over implicit** - be clear about types and intentions
- **Keep functions small** - aim for functions that do one thing well
- **Document complex business logic** with comments explaining the "why", not the "what"
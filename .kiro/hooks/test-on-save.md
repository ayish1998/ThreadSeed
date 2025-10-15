# Auto-Test Hook

## Trigger
File save events for TypeScript files

## Action
Run relevant tests automatically to catch issues early

## Configuration
```yaml
name: "Auto Test on Save"
trigger: "file_save"
filePattern: "src/**/*.{ts,tsx}"
action: "run_tests"
debounce: 1000ms
```

## Implementation
When any TypeScript file in src/ is saved:
1. Run type checking
2. Execute unit tests for the changed file
3. Show results in terminal
4. Highlight any errors in the editor

This helps catch issues immediately and maintains code quality throughout development.
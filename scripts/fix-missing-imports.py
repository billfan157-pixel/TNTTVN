import os
import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Check if React or hooks are used
    uses_react = re.search(r'\bReact\.', content)
    uses_hooks = re.search(r'\b(useState|useEffect|useMemo|useCallback|useRef|Suspense|lazy)\b', content)
    
    if not (uses_react or uses_hooks):
        return

    # Check if React is already imported
    # Matches: import React ... or import { ... } from 'react'
    has_react_import = re.search(r'import\s+React\b', content)
    has_named_import = re.search(r'import\s+\{.*\}\s+from\s+[\'"]react[\'"]', content)
    
    if not (has_react_import or has_named_import):
        print(f"Fixing {filepath}")
        hooks = []
        for hook in ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'Suspense', 'lazy']:
            if re.search(rf'\b{hook}\b', content):
                hooks.append(hook)
        
        if hooks:
            import_line = f"import React, {{ {', '.join(hooks)} }} from 'react'\n"
        else:
            import_line = "import React from 'react'\n"
            
        with open(filepath, 'w') as f:
            f.write(import_line + content)

def main():
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                fix_file(os.path.join(root, file))

if __name__ == '__main__':
    main()

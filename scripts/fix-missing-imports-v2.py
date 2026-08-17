import os
import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    needs_react = 'React.' in content or '<' in content or 'React.FC' in content
    needs_hooks = []
    if 'useState' in content and 'useState' not in content.split('\n')[0]:
        needs_hooks.append('useState')
    if 'useEffect' in content and 'useEffect' not in content.split('\n')[0]:
        needs_hooks.append('useEffect')
    if 'useMemo' in content and 'useMemo' not in content.split('\n')[0]:
        needs_hooks.append('useMemo')
    if 'useCallback' in content and 'useCallback' not in content.split('\n')[0]:
        needs_hooks.append('useCallback')
    if 'useRef' in content and 'useRef' not in content.split('\n')[0]:
        needs_hooks.append('useRef')

    has_react_import = 'import React' in content or "from 'react'" in content or 'import {' in content and "'react'" in content

    if (needs_react or needs_hooks) and not has_react_import:
        hook_str = ''
        if needs_hooks:
            hook_str = ', { ' + ', '.join(needs_hooks) + ' }'
        
        new_import = f"import React{hook_str} from 'react'\n"
        print(f"Fixing {path}: adding {new_import.strip()}")
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_import + content)
        return True
    
    # Also check if React is used but not imported (e.g. React.FC)
    if 'React.' in content and 'import React' not in content:
         new_import = "import React from 'react'\n"
         print(f"Fixing {path}: adding React import for React. usage")
         with open(path, 'w', encoding='utf-8') as f:
            f.write(new_import + content)
         return True

    return False

def main():
    root_dir = '/home/ubuntu/brave-davinci-repo/src'
    count = 0
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                if fix_file(os.path.join(root, file)):
                    count += 1
    print(f"Total files fixed: {count}")

if __name__ == '__main__':
    main()

taskkill /F /IM node.exe 2>$null
Remove-Item -Recurse -Force '.next' -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force 'node_modules/.cache' -ErrorAction SilentlyContinue
echo done

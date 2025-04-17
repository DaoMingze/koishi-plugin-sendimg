cd ../..
fnm env --use-on-cd | Out-String | Invoke-Expression
npm run bump sendimg -3
npm run build sendimg
npm run pub sendimg -- --registry https://registry.npmjs.org
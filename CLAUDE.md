1. 必须验证通过后才可以提交代码。
2. 没有用户的同意不要擅自发起commit
3. 修改版本号时，必须同步更新所有相关文件中的版本号（package.json、electron-builder.yml 等），确保版本一致
4. 界面组件禁止使用系统原生样式（radio、checkbox、select 等），必须自定义样式，保持与整体暗色主题风格一致
5. 远程服务器版本号（packages/remote/package.json）与应用版本号独立维护，仅当远程服务器代码有实际变更时才更新。修改应用版本号时不要误改远程服务器版本号。

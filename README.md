# 打地鼠游戏（Vue 3 + TypeScript）

一个使用 Vue 3 + TypeScript + Vite 实现的网页版「打地鼠」小游戏。

## 游戏规则

- 游戏界面是一个 4×4 的网格。
- 每隔 1～2 秒，会有一只地鼠随机出现在一个格子里。
- 点击地鼠即可得分，得分实时显示。
- 点击「开始游戏」按钮开始一局，倒计时 30 秒；倒计时结束后游戏结束。
- 游戏中可随时点击「重新开始」重新开始一局。

## 运行方式

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 目录结构

```
├── index.html          # 页面入口
├── package.json        # 项目依赖与脚本
├── tsconfig.json       # TypeScript 配置
├── vite.config.ts      # Vite 配置
└── src
    ├── main.ts         # 应用入口
    ├── App.vue         # 游戏主组件（界面 + 逻辑）
    ├── style.css       # 全局样式
    └── vite-env.d.ts   # Vite 类型声明
```

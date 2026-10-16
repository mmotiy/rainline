# Rainline

**雨夜城市里的浏览器赛车游戏。** 驾驶、漂移、氮气加速，在霓虹街道、集装箱港区和山间弯道中竞速，甩开追逐你的警车。

**简体中文** · [English](README.en.md)

[在线游玩](https://mmotiy.github.io/rainline/) · [性能验证报告](docs/performance.md) · [问题反馈](https://github.com/mmotiy/rainline/issues)

![Rainline 雨夜城市实机画面](docs/images/gameplay.png)

## 游戏内容

- **城市驾驶**：探索 Port Kessel 市中心、Saltyard Docks 港区与 Ridgeback Pass 山路。
- **赛事挑战**：Ring Sprint、Saltyard Circuit、Ridgeback Run，以及 Plaza Drift Trial 漂移计分挑战。
- **警察追逐**：热度、追捕、逃脱和被捕进度，以及更高热度下更强的追捕力量。
- **车辆与车库**：购买车辆、升级性能，调整车漆、轮圈、底盘灯、尾翼和车窗效果。
- **动态环境**：昼夜变化、雨幕、水花、湿地反光、霓虹泛光和动态阴影。
- **本地进度**：通过 localStorage 保存车辆、现金、赛事成绩和设置，另有本地幽灵回放数据。

当前版本为**单机游戏**，交通车辆、对手与警车由程序控制，尚未接入在线多人房间。

## 开始游玩

1. 用支持 WebGL2 的现代浏览器打开[游戏网址](https://mmotiy.github.io/rainline/)。
2. 等待城市、车辆、贴图和物理引擎加载，点击 **Start engine**。
3. 打开地图寻找赛事标记，靠近后按 **E** 开始赛事或进入车库。

建议先用桌面版 Chrome 或 Edge、键盘或手柄体验。资源总量约 50 MB，首次加载取决于网络速度。程序包含触屏按键，但尚未完成移动设备的全面兼容性与性能验证。

进度保存在当前浏览器与站点中，不会自动跨设备同步；清理网站数据可能清除存档。

### 操作

| 操作 | 键盘 | 标准布局手柄 |
| --- | --- | --- |
| 加速 | W / ↑ | RT |
| 刹车 / 倒车 | S / ↓ | LT |
| 转向 | A、D / ←、→ | 左摇杆 |
| 手刹 / 漂移 | Space | A |
| 氮气加速 | Shift | B |
| 赛事 / 车库交互 | E | X |
| 切换相机 | C | Y |
| 地图 | M | Back / View |
| 重置车辆 | R | LB |
| 暂停 | Esc | Start / Menu |

### 画质

提供 **Ultra、High、Medium、Low** 四档画质。Ultra 启用环境遮蔽、SMAA、完整视距、16,000 雨粒子和 4096 阴影贴图。设置中还可调整雨天、时间、运动模糊、镜头抖动、声音及 FPS 显示。

原有自适应分辨率逻辑保留：负载过高时会调整内部渲染分辨率。最高特效不代表所有显卡都能稳定 60 FPS。

## 本地运行

项目由静态 HTML、JavaScript 与资源组成，**无需打包构建或游戏后端**。安装 Python 3 后，在项目根目录运行：

```sh
python -m http.server 8080 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8080/>，按 `Ctrl+C` 停止服务。Windows 也可使用 `py -m http.server 8080 --bind 127.0.0.1`。

请通过 HTTP 访问，不要直接双击 `index.html`，否则 ES 模块和资源加载可能失败。Three.js、Rapier 与字体目前从外部 CDN 加载，本地运行仍需联网。Rapier 加载或初始化失败时，游戏会尝试使用内置简化物理实现。

## 技术与目录

| 部分 | 实现 |
| --- | --- |
| 三维渲染 | Three.js **0.170.0**、WebGL2 |
| 车辆碰撞物理 | Rapier **0.14.0**，带简化物理回退 |
| 后处理 | GTAO、Bloom、SMAA、运动模糊、LUT 调色 |
| 城市加载 | 分格加载、LOD、远景立面替身、批次与实例绘制 |
| 输入与界面 | 键盘、Gamepad API、触屏按键、HTML/CSS HUD、Canvas 地图 |
| 存档与发布 | localStorage、GitHub Pages |

```text
index.html                    游戏入口、玩法、界面与场景逻辑
assets/                       车辆、城市模块、HDR 和贴图
city-batch.mjs                城市分组剔除与包围体缓存
render-performance.mjs        空间索引、GPU 计时与阴影复用辅助
tools/                        单元测试与浏览器验证脚本
docs/performance.md           第一轮性能验证方法与结果
docs/images/                  项目展示截图
README.md                     中文说明
README.en.md                  English documentation
```

## 渲染优化

- 按保守空间分组进行相机剔除，各通道使用自己的相机，保留屏幕外物体投进画面的阴影。
- 实例加载或复用时缓存包围体，保持原绘制顺序，包括透明材质。
- AO 法线通道复用主画面的阴影贴图，避免重复绘制；主画面动态阴影仍逐帧更新。
- 城市更新只查询附近空间桶和已加载格子，保留原 LOD 距离与卸载规则。
- 使用异步 GPU timer query，区分 GPU 耗时和 CPU 渲染提交耗时。

第一轮在 RTX 3080、固定 1920×1080、Ultra 下验证：七个固定视角逐像素一致，城市格子检查数量减少约 85%；短路线驾驶对照平均帧率约为 34.4 → 66.9 FPS。

这是**同版本关闭 / 开启渲染优化的对照**，两组均包含空间索引，并非完整旧版与新版的端到端基准，不能外推为中端显卡的帧率保证。具体方法、CPU 开销和 P99 帧耗时见[报告](docs/performance.md)。目前未迁移至 WebGPU 或 Web Workers。

`city-batch.mjs` 适配了 Three.js r170 的内部 BatchedMesh 绘制字段；升级 Three.js 前应重新验证剔除、阴影、透明材质与画面一致性。

## 验证与测试

安装 Node.js 后可直接运行单元测试，无需额外依赖：

```sh
node --test tools/streaming.test.mjs tools/gpu-timer.test.mjs
```

浏览器验证需要可被 Node.js 找到的 `playwright` 包和默认位置的 Windows Chrome：

```sh
npm install --no-save --package-lock=false playwright
node tools/performance-check.cjs
```

脚本固定使用 `C:/Program Files/Google/Chrome/Application/chrome.exe`，其他路径或操作系统需调整脚本。验证覆盖像素对照、GPU 开销、画质切换及远距离传送后的格子状态、连续驾驶；内部 pixelRatio 固定为 1，避免通过降分辨率取得提升。

报告和截图默认输出到系统临时目录下的 `rainline-perf`，可用 `RAINLINE_QA_DIR` 环境变量更换目录。脚本结束时关闭自己启动的服务器和浏览器。静止场景同步 GPU 采样不代表驾驶 FPS。

## GitHub Pages 发布

当前以 **main 分支根目录**作为 Pages 发布源。提交并推送变更后，GitHub 自动构建和部署；在仓库 Actions 中确认部署成功，再访问在线版本。

保持 `index.html`、两个 `.mjs` 文件与 `assets/` 的相对目录关系。GitHub Pages 负责静态文件分发，不提供联机游戏服务器。

## 素材署名与使用说明

以下为项目现有游戏界面中的素材署名：

| 素材 | 作者 / 来源 | 标注许可 |
| --- | --- | --- |
| Car Concept | Eric Chadwick / Darmstadt Graphics Group | CC BY 4.0 |
| Toyota GR Supra GT300 | vecarz，当前版本已移除涂装 | CC BY 4.0 |
| 环境光照 HDRI | Poly Haven | CC0 |
| 城市模块 | 为 Rainline 生成 | 未单独标注 |

本仓库尚未声明统一的项目许可证；公开可访问不代表代码和全部素材可不受限制地再分发或商用。使用素材时应保留相应署名，并核实原始来源和许可。最初生成项目的 AI 平台尚未确认，不作模型或平台归属声明。

反馈问题时，请附浏览器版本、显卡、窗口分辨率、画质档位、复现步骤，以及相关截图或控制台错误。

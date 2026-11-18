# edge-proxy-cloudflare

GuEarth（咕咕地球）基于 **Cloudflare Workers** 的 Serverless 镜像代理服务。

## 项目结构

```text
edge-proxy-cloudflare/
├── wrangler.jsonc                       # Cloudflare Workers 配置
├── package.json
├── src/
│   ├── index.js
│   ├── router.js
│   ├── lib/
│   │   ├── proxy.js
│   │   └── hazel.js
│   └── routes/
│       ├── manifest.js                  # GET /
│       ├── health.js                    # GET /health
│       ├── modelsdev.js                 # GET /modelsdev
│       ├── tiles.js                     # OSM / Esri / OpenTopo / VIIRS 瓦片
│       ├── arcgis.js                    # /arcgis 与 /arcgis/tile/{z}/{y}/{x}
│       ├── earthquakes.js               # /datasets/earthquakes
│       ├── update.js                    # /update/{platform}/{version}[/RELEASES]
│       └── download.js                  # /download[/{platform}[/{tag}/{file}]]
└── test/
    ├── parse.spec.js
    ├── proxy.spec.js
    ├── upstream.spec.js
    ├── hazel.spec.js
    ├── worker.spec.js
    └── run.js
```

## 部署

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## 开发与测试

```bash
npm test            # 单元测试 + Worker 集成测试
npm run test:smoke  # 冒烟测试
npm run dev         # wrangler dev 本地 workerd 运行时调试
```

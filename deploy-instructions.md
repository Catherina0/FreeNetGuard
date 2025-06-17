# Cloudflare Worker 短链接解析服务部署说明

## 概述

这个项目包含两个主要组件：

1. **Cloudflare Worker** (`worker.js`) - 用于解析短链接为长链接的服务

2. **URL清理器** (`UrlCleaner copy.html`) - 前端页面，整合了短链接解析和URL追踪参数清理功能

## 部署步骤

### 1. 部署Cloudflare Worker

#### 方法一：使用Cloudflare Dashboard（推荐新手）

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 登录您的账户
3. 点击左侧菜单中的 "Workers & Pages"
4. 点击 "Create application"
5. 选择 "Create Worker"
6. 给您的Worker起个名字（例如：`url-resolver`）
7. 点击 "Deploy"
8. 在代码编辑器中，删除所有现有代码
9. 复制 `worker.js` 文件的内容并粘贴到编辑器中
10. 点击 "Save and Deploy"

#### 方法二：使用Wrangler CLI

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 创建新的Worker项目
wrangler generate url-resolver

# 进入项目目录
cd url-resolver

# 将我们的worker.js代码复制到src/index.js
# 或者直接替换文件内容

# 部署Worker
wrangler publish
```

### 2. 配置URL清理器

1. 找到您部署的Worker的URL，格式通常为：
   ```
   https://your-worker-name.your-subdomain.workers.dev
   ```

2. 编辑 `UrlCleaner copy.html` 文件中的第106行：
   ```javascript
   const workerUrl = 'https://your-worker-subdomain.your-domain.workers.dev';
   ```
   将其替换为您实际的Worker URL。

3. 保存文件并部署到您的网站服务器。

## Worker API 使用方法

### GET 请求
```
GET https://your-worker.workers.dev?url=https://short.link/abc123
```

### POST 请求
```javascript
fetch('https://your-worker.workers.dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://short.link/abc123'
  })
})
```

### 响应格式
```json
{
  "originalUrl": "https://short.link/abc123",
  "resolvedUrl": "https://example.com/full-url",
  "success": true
}
```

## 特性

### Worker特性
- **HTTP重定向支持**: 自动跟踪301/302等HTTP重定向
- **客户端重定向解析**: 解析Meta Refresh和JavaScript重定向
- **多平台支持**: 特别优化淘宝、京东、小红书等平台
- **智能HTML解析**: 从页面内容中提取真实链接
- **CORS支持**: 可从任何域名调用
- **性能优化**: 包含Cloudflare缓存和智能重试机制

### URL清理器增强特性
- **智能链接识别**: 自动区分短链接和长链接
- **优化处理逻辑**: 短链接先解析，长链接直接清理
- **全面追踪参数清理**: 支持50+种追踪参数
- **平台特殊处理**: 
  - 小红书: 保留核心ID，移除所有追踪参数
  - 京东: 自动解析重定向链接中的真实商品URL
  - 抖音: 保留视频ID，移除追踪参数
  - 淘宝: 商品链接只保留ID参数
- **回退机制**: 多重保障确保服务稳定性

## 支持的短链接服务

Worker可以解析几乎所有类型的短链接服务，包括但不限于：
- bit.ly
- tinyurl.com
- t.co (Twitter)
- goo.gl (已停用但仍可解析)
- ow.ly
- buff.ly
- short.link
- 以及其他使用HTTP重定向的短链接服务

## 故障排除

### 常见问题

1. **CORS错误**
   - Worker已配置支持CORS，如果仍有问题，检查Worker是否正确部署

2. **Worker URL错误**
   - 确保在HTML文件中正确设置了Worker URL
   - 检查Worker是否成功部署并可访问

3. **某些短链接无法解析**
   - 某些服务可能有反爬虫机制
   - Worker会自动回退到原始方法

4. **请求超时**
   - Cloudflare Worker有执行时间限制
   - 对于特别慢的重定向链，可能需要优化

### 调试方法

在浏览器控制台中检查错误信息：
```javascript
// 打开浏览器开发者工具 -> Console
// 查看任何错误信息
```

## 成本说明

- Cloudflare Workers 免费计划包含每天100,000次请求
- 超出后按使用量计费，非常便宜
- 对于个人使用来说，免费额度通常足够

## 安全考虑

- Worker不会存储任何用户数据
- 所有请求都是临时的，不会被记录
- 支持HTTPS，确保传输安全
- 建议定期更新Worker代码以获得最新的安全特性

## 更新维护

要更新Worker：
1. 修改 `worker.js` 文件
2. 重新部署到Cloudflare
3. 无需修改HTML文件（除非API接口发生变化）

## 测试工具

项目包含多个测试工具帮助您验证功能：

### 1. `test-worker.html`
- 基础Worker功能测试
- 支持单个链接和批量测试
- 实时日志显示

### 2. `test-taobao-links.html`
- 专门针对淘宝短链接的测试
- 详细的解析性能分析
- 支持客户端重定向测试

### 3. `test-comprehensive-links.html`
- 综合平台链接测试
- 展示各平台的清理效果
- 包含您提到的实际链接测试

### 使用测试工具：
1. 部署Worker后，在测试页面配置Worker URL
2. 运行预设测试用例查看效果
3. 输入自定义链接进行测试
4. 查看详细的处理结果和性能数据

## 技术支持

如果遇到问题，可以：
1. 使用测试工具诊断问题
2. 检查Cloudflare Worker的日志
3. 在浏览器控制台查看错误信息
4. 联系：report@cntt.uk 
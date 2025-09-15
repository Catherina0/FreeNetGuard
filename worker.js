export default {
  async fetch(request, env, ctx) {
    // 处理CORS预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 设置CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      let shortUrl;
      
      // 支持GET和POST请求
      if (request.method === 'GET') {
        const url = new URL(request.url);
        shortUrl = url.searchParams.get('url');
      } else if (request.method === 'POST') {
        const body = await request.json();
        shortUrl = body.url;
      }

      if (!shortUrl) {
        return new Response(JSON.stringify({
          error: '请提供要解析的URL',
          message: 'Please provide a URL to resolve'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // 验证URL格式
      try {
        new URL(shortUrl);
      } catch (e) {
        return new Response(JSON.stringify({
          error: '无效的URL格式',
          message: 'Invalid URL format'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // 解析短链接
      const resolvedUrl = await resolveShortUrl(shortUrl);

      return new Response(JSON.stringify({
        originalUrl: shortUrl,
        resolvedUrl: resolvedUrl,
        success: true
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Worker错误:', error);
      return new Response(JSON.stringify({
        error: '服务器内部错误',
        message: 'Internal server error',
        details: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },
};

/**
 * 解析短链接为长链接
 * @param {string} shortUrl 短链接
 * @returns {Promise<string>} 解析后的长链接
 */
async function resolveShortUrl(shortUrl) {
  try {
    // 设置请求头，模拟真实浏览器
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    // 首先尝试HEAD请求检查是否有HTTP重定向
    const headResponse = await fetch(shortUrl, {
      method: 'HEAD',
      headers: headers,
      redirect: 'follow',
      cf: {
        cacheTtl: 300,
        cacheEverything: false
      }
    });

    // 如果HEAD请求的URL发生了变化，说明有HTTP重定向
    if (headResponse.url !== shortUrl) {
      return headResponse.url;
    }

    // 如果没有HTTP重定向，尝试GET请求获取页面内容来解析客户端重定向
    const getResponse = await fetch(shortUrl, {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
      cf: {
        cacheTtl: 300,
        cacheEverything: false
      }
    });

    // 检查是否有HTTP重定向
    if (getResponse.url !== shortUrl) {
      return getResponse.url;
    }

    // 检查Content-Type是否为HTML
    const contentType = getResponse.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await getResponse.text();
      
      // 尝试解析客户端重定向
      const clientRedirectUrl = parseClientRedirect(html, shortUrl);
      if (clientRedirectUrl) {
        return clientRedirectUrl;
      }
    }

    // 如果都没有找到重定向，返回最终的URL
    return getResponse.url;

  } catch (error) {
    console.error('解析短链接失败:', error);
    
    // 最后的回退：直接返回原始URL
    return shortUrl;
  }
}

/**
 * 解析HTML中的客户端重定向
 * @param {string} html HTML内容
 * @param {string} baseUrl 基础URL，用于解析相对路径
 * @returns {string|null} 找到的重定向URL，如果没有找到返回null
 */
function parseClientRedirect(html, baseUrl) {
  try {
    // 1. 解析Meta Refresh重定向
    const metaRefreshMatch = html.match(/<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']([^"']*)/i);
    if (metaRefreshMatch) {
      const content = metaRefreshMatch[1];
      const urlMatch = content.match(/url\s*=\s*["']?([^"'\s>]+)/i);
      if (urlMatch) {
        const url = urlMatch[1];
        return resolveUrl(url, baseUrl);
      }
    }

    // 2. 解析JavaScript重定向 - window.location
    const jsLocationMatches = [
      /window\.location\s*=\s*["']([^"']+)/gi,
      /window\.location\.href\s*=\s*["']([^"']+)/gi,
      /location\.href\s*=\s*["']([^"']+)/gi,
      /location\s*=\s*["']([^"']+)/gi
    ];

    for (const regex of jsLocationMatches) {
      let match;
      while ((match = regex.exec(html)) !== null) {
        const url = match[1];
        if (url && url !== baseUrl) {
          return resolveUrl(url, baseUrl);
        }
      }
    }

    // 3. 特殊处理各种平台的短链接
    // 淘宝/天猫短链接
    if (baseUrl.includes('tb.cn') || baseUrl.includes('taobao.com')) {
      const tbMatches = [
        /var\s+url\s*=\s*["']([^"']+)/gi,
        /location\.replace\s*\(\s*["']([^"']+)/gi,
        /href\s*=\s*["']([^"']*(?:item\.taobao\.com|detail\.tmall\.com)[^"']*)/gi,
        /window\.open\s*\(\s*["']([^"']*(?:item\.taobao\.com|detail\.tmall\.com)[^"']*)/gi,
        /"url"\s*:\s*"([^"]*(?:item\.taobao\.com|detail\.tmall\.com)[^"]*)"/gi
      ];

      for (const regex of tbMatches) {
        let match;
        while ((match = regex.exec(html)) !== null) {
          const url = match[1];
          if (url && url !== baseUrl && !url.includes('tb.cn')) {
            return resolveUrl(url, baseUrl);
          }
        }
      }
    }

    // 京东短链接
    if (baseUrl.includes('jd.com') || baseUrl.includes('3.cn')) {
      const jdMatches = [
        /href\s*=\s*["']([^"']*(?:item\.jd\.com|product\.jd\.com)[^"']*)/gi,
        /location\.href\s*=\s*["']([^"']*(?:item\.jd\.com|product\.jd\.com)[^"']*)/gi
      ];

      for (const regex of jdMatches) {
        let match;
        while ((match = regex.exec(html)) !== null) {
          const url = match[1];
          if (url && url !== baseUrl) {
            return resolveUrl(url, baseUrl);
          }
        }
      }
    }

    // 小红书短链接
    if (baseUrl.includes('xhslink.com') || baseUrl.includes('xiaohongshu.com')) {
      const xhsMatches = [
        /href\s*=\s*["']([^"']*(?:xiaohongshu\.com|xhslink\.com)[^"']*)/gi,
        /window\.location\s*=\s*["']([^"']*(?:xiaohongshu\.com)[^"']*)/gi
      ];

      for (const regex of xhsMatches) {
        let match;
        while ((match = regex.exec(html)) !== null) {
          const url = match[1];
          if (url && url !== baseUrl) {
            return resolveUrl(url, baseUrl);
          }
        }
      }
    }

    // 4. 查找页面中的长链接模式
    const linkPatterns = [
      // 淘宝/天猫商品链接
      /https?:\/\/(?:item\.taobao\.com|detail\.tmall\.com|www\.taobao\.com)[^\s"'<>]+/gi,
      // 京东商品链接
      /https?:\/\/(?:item\.jd\.com|product\.jd\.com)[^\s"'<>]+/gi,
      // 小红书链接
      /https?:\/\/(?:www\.)?xiaohongshu\.com[^\s"'<>]+/gi,
      // 通用商品页面模式
      /https?:\/\/[^\s"'<>]*(?:item\.htm|detail\.htm|product\.htm)[^\s"'<>]*/gi,
      // 查找任何包含商品ID的长链接
      /https?:\/\/[^\s"'<>]*[?&](?:id|item_id|product_id|goods_id)=[^&\s"'<>]+[^\s"'<>]*/gi
    ];

    for (const regex of linkPatterns) {
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        // 过滤掉短链接，返回第一个长链接
        for (const match of matches) {
          if (!isShortLink(match)) {
            return match;
          }
        }
      }
    }

    // 5. 最后尝试：查找任何看起来像重定向的URL
    const anyUrlPattern = /https?:\/\/[^\s"'<>]+/gi;
    const allUrls = html.match(anyUrlPattern);
    if (allUrls && allUrls.length > 0) {
      // 返回第一个不是当前短链接的URL
      for (const url of allUrls) {
        if (url !== baseUrl && !isShortLink(url)) {
          return url;
        }
      }
    }

    return null;

  } catch (error) {
    console.error('解析客户端重定向失败:', error);
    return null;
  }
}

/**
 * 判断是否为短链接
 * @param {string} url URL
 * @returns {boolean} 是否为短链接
 */
function isShortLink(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // 常见的短链接域名
    const shortLinkDomains = [
      'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly',
      'short.link', 'is.gd', 'v.ht', 'tb.cn', '3.cn', 'xhslink.com',
      'dwz.cn', 'suo.im', 'mrw.so', 'url.cn', 'sina.lt', 'qq.cn'
    ];
    
    // 检查是否是短链接域名
    if (shortLinkDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
      return true;
    }
    
    // 检查路径长度（短链接通常路径很短）
    const path = urlObj.pathname;
    if (path.length <= 10 && /^\/[a-zA-Z0-9_-]+$/.test(path)) {
      return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 解析相对URL为绝对URL
 * @param {string} url 可能是相对路径的URL
 * @param {string} baseUrl 基础URL
 * @returns {string} 绝对URL
 */
function resolveUrl(url, baseUrl) {
  try {
    // 如果已经是绝对URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // 使用URL构造函数解析相对路径
    const base = new URL(baseUrl);
    const resolved = new URL(url, base);
    return resolved.toString();
  } catch (error) {
    console.error('解析URL失败:', error);
    return url;
  }
} 
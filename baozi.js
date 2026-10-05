class Baozi extends ComicSource {
  // 此漫画源的名称
  name = "包子漫画";

  // 唯一标识符
  key = "baozi";

  version = "1.1.7";

  minAppVersion = "1.0.0";

  // 更新链接
  url = "https://raw.githubusercontent.com/coolman1232004/venera-configs/main/baozi.js";

  settings = {
    language: {
      title: "简繁切换",
      type: "select",
      options: [
        { value: "cn", text: "简体" },
        { value: "tw", text: "繁體" },
      ],
      default: "cn",
    },
    domains: {
      title: "主域名",
      type: "select",
      options: [
        { value: "bzmgcn.com" },
        { value: "baozimhcn.com" },
        { value: "webmota.com" },
        { value: "kukuc.co" },
        { value: "twmanga.com" },
        { value: "dinnerku.com" },
      ],
      default: "webmota.com",
    },
    cdn_domains: {
      title: "图片资源站域名",
      type: "select",
      options: [
        { value: "s1.bzcdn.net" },
        { value: "as-rsa1-usla.baozicdn.com" },
        { value: "ascn-a3.bzcdn.net" },
        { value: "asgb-a3.bzcdn.net" },
        { value: "as.baozimh.com" },
        { value: "s1.baozicdn.com" },
        { value: "", text: "默认" },
      ],
      default: "",
    },
    image_quality: {
      title: "图片质量",
      type: "select",
      options: [
        {
          value: "/w640",
          text: "640p"
        },
        {
          value: "",
          text: "原图"
        }
      ],
      default: "/w640",
    },
  };

  // 动态生成完整域名
  get lang() {
    return this.loadSetting("language") || this.settings.language.default;
  }
  get domain() {
    let domain = this.loadSetting("domains") || this.settings.domains.default;
    // 旧版简体默认域名会跳转到不可用的 www 站，兼容已保存的设置。
    if (this.lang === "cn" && ["bzmgcn.com", "baozimhcn.com"].includes(domain)) {
      domain = this.settings.domains.default;
    }
    return domain;
  }
  get baseUrl() {
    return `https://${this.lang}.${this.domain}`;
  }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
      Referer: `${this.baseUrl}/`,
    };
  }

  absoluteUrl(url, base = this.baseUrl) {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith("//")) return "https:" + url;
    const origin = base.match(/^https?:\/\/[^/]+/)[0];
    if (url.startsWith("/")) return origin + url;
    const page = base.split(/[?#]/)[0];
    if (page === origin) return origin + "/" + url;
    return page.replace(/\/[^/]*$/, "/") + url;
  }

  chapterKey(href, fallback) {
    const section = href.match(/[?&]section_slot=(\d+)/);
    const chapter = href.match(/[?&]chapter_slot=(\d+)/);
    const path = href.match(/\/(\d+)_(\d+)(?:_\d+)?\.html(?:[?#]|$)/);
    const slots = chapter ? [section ? section[1] : "0", chapter[1]] : path?.slice(1, 3);
    if (!slots) return String(fallback);
    // 保留原来第一分卷的数字编号，其他分卷使用 section_chapter。
    return slots[0] === "0" ? slots[1] : slots.join("_");
  }

  imageUrl(url, base) {
    url = this.absoluteUrl(url, base);
    const match = url.match(/^https?:\/\/([^/]+)(\/(?:w\d+\/)?[a-z]comic\/.*)$/);
    if (!match) return null;
    const domain = this.loadSetting("cdn_domains") || match[1];
    const quality = this.loadSetting("image_quality") ?? this.settings.image_quality.default;
    const path = match[2].replace(/^\/w\d+(?=\/)/, "");
    return `https://${domain}${quality}${path}`;
  }

  isComicImage(url, comicId) {
    const path = url.match(/\/[a-z]comic\/([^/]+)\//);
    if (!path) return false;
    // 网站会给漫画 slug 加上六位后缀，图片目录仍使用原 slug。
    const normalize = (id) => decodeURIComponent(id).replace(/_[a-z0-9]{6}$/i, "");
    return normalize(path[1]) === normalize(comicId);
  }

  /// 账号
  /// 设置为null禁用账号功能
  account = {
    /// 登录
    /// 返回任意值表示登录成功
    login: async (account, pwd) => {
      let res = await Network.post(
        `${this.baseUrl}/api/bui/signin`,
        {
          "content-type":
            "multipart/form-data; boundary=----WebKitFormBoundaryFUNUxpOwyUaDop8s",
        },
        '------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="username"\r\n\r\n' +
        account +
        '\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="password"\r\n\r\n' +
        pwd +
        "\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s--\r\n"
      );
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let json = JSON.parse(res.body);
      let token = json.data;
      Network.setCookies(this.baseUrl, [
        new Cookie({
          name: "TSID",
          value: token,
          domain: this.domain,
        }),
      ]);
      return "ok";
    },

    // 退出登录时将会调用此函数
    logout: () => {
      Network.deleteCookies(this.domain);
    },

    get registerWebsite() {
      return `${this.baseUrl}/user/signup`;
    },
  };

  /// 解析漫画列表
  parseComic(e) {
    let url = e.querySelector("a").attributes["href"];
    let id = url.split("/").pop();
    let title = e.querySelector("h3").text.trim();
    let cover = e.querySelector("a > amp-img").attributes["src"];
    let tags = e.querySelectorAll("div.tabs > span").map((e) => e.text.trim());
    let description = e.querySelector("small").text.trim();
    return {
      id: id,
      title: title,
      cover: cover,
      tags: tags,
      description: description,
    };
  }

  parseJsonComic(e) {
    return {
      id: e.comic_id,
      title: e.name,
      subTitle: e.author,
      cover: `https://static-tw.baozimh.com/cover/${e.topic_img}?w=285&h=375&q=100`,
      tags: e.type_names,
    };
  }

  /// 探索页面
  /// 一个漫画源可以有多个探索页面
  explore = [
    {
      /// 标题
      /// 标题同时用作标识符, 不能重复
      title: "包子漫画",

      /// singlePageWithMultiPart 或者 multiPageComicList
      type: "singlePageWithMultiPart",

      load: async () => {
        var res = await Network.get(this.baseUrl, this.headers);
        if (res.status !== 200) {
          throw "Invalid status code: " + res.status;
        }
        let document = new HtmlDocument(res.body);
        let parts = document.querySelectorAll("div.index-recommend-items");
        let result = {};
        for (let part of parts) {
          let title = part.querySelector("div.catalog-title").text.trim();
          let comics = part
            .querySelectorAll("div.comics-card")
            .map((e) => this.parseComic(e));
          if (comics.length > 0) {
            result[title] = comics;
          }
        }
        return result;
      },
    },
  ];

  /// 分类页面
  /// 一个漫画源只能有一个分类页面, 也可以没有, 设置为null禁用分类页面
  category = {
    /// 标题, 同时为标识符, 不能与其他漫画源的分类页面重复
    title: "包子漫画",
    parts: [
      {
        name: "类型",

        // fixed 或者 random
        // random用于分类数量相当多时, 随机显示其中一部分
        type: "fixed",

        // 如果类型为random, 需要提供此字段, 表示同时显示的数量
        // randomNumber: 5,

        categories: [
          "全部",
          "恋爱",
          "纯爱",
          "古风",
          "异能",
          "悬疑",
          "剧情",
          "科幻",
          "奇幻",
          "玄幻",
          "穿越",
          "冒险",
          "推理",
          "武侠",
          "格斗",
          "战争",
          "热血",
          "搞笑",
          "大女主",
          "都市",
          "总裁",
          "后宫",
          "日常",
          "韩漫",
          "少年",
          "其它",
        ],

        // category或者search
        // 如果为category, 点击后将进入分类漫画页面, 使用下方的`categoryComics`加载漫画
        // 如果为search, 将进入搜索页面
        itemType: "category",

        // 若提供, 数量需要和`categories`一致, `categoryComics.load`方法将会收到此参数
        categoryParams: [
          "all",
          "lianai",
          "chunai",
          "gufeng",
          "yineng",
          "xuanyi",
          "juqing",
          "kehuan",
          "qihuan",
          "xuanhuan",
          "chuanyue",
          "mouxian",
          "tuili",
          "wuxia",
          "gedou",
          "zhanzheng",
          "rexie",
          "gaoxiao",
          "danuzhu",
          "dushi",
          "zongcai",
          "hougong",
          "richang",
          "hanman",
          "shaonian",
          "qita",
        ],
      },
    ],
    enableRankingPage: false,
  };

  /// 分类漫画页面, 即点击分类标签后进入的页面
  categoryComics = {
    load: async (category, param, options, page) => {
      let res = await Network.get(
        `${this.baseUrl}/api/bzmhq/amp_comic_list?type=${param}&region=${options[0]}&state=${options[1]}&filter=%2a&page=${page}&limit=36&language=${this.lang}&__amp_source_origin=${this.baseUrl}`,
        this.headers
      );
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let maxPage = null;
      let json = JSON.parse(res.body);
      if (!json.next) {
        maxPage = page;
      }
      return {
        comics: json.items.map((e) => this.parseJsonComic(e)),
        maxPage: maxPage,
      };
    },
    // 提供选项
    optionList: [
      {
        options: ["all-全部", "cn-国漫", "jp-日本", "kr-韩国", "en-欧美"],
      },
      {
        options: ["all-全部", "serial-连载中", "pub-已完结"],
      },
    ],
  };

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let res = await Network.get(`${this.baseUrl}/search?q=${encodeURIComponent(keyword)}`, this.headers);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);
      let comics = document
        .querySelectorAll("div.comics-card")
        .map((e) => this.parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },

    // 提供选项
    optionList: [],
  };

  /// 收藏
  favorites = {
    /// 是否为多收藏夹
    multiFolder: false,
    /// 添加或者删除收藏
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      if (!isAdding) {
        let res = await Network.post(
          `${this.baseUrl}/user/operation_v2?op=del_bookmark&comic_id=${comicId}`
        );
        if (!res.status || res.status >= 400) {
          throw "Invalid status code: " + res.status;
        }
        return "ok";
      } else {
        let res = await Network.post(
          `${this.baseUrl}/user/operation_v2?op=set_bookmark&comic_id=${comicId}&chapter_slot=0`
        );
        if (!res.status || res.status >= 400) {
          throw "Invalid status code: " + res.status;
        }
        return "ok";
      }
    },
    // 加载收藏夹, 仅当multiFolder为true时有效
    // 当comicId不为null时, 需要同时返回包含该漫画的收藏夹
    loadFolders: null,
    /// 加载漫画
    loadComics: async (page, folder) => {
      let res = await Network.get(`${this.baseUrl}/user/my_bookshelf`);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);
      function parseComic(e) {
        let title = e.querySelector("h4 > a").text.trim();
        let url = e.querySelector("h4 > a").attributes["href"];
        let id = url.split("/").pop();
        let author = e
          .querySelector("div.info > ul")
          .children[1].text.split("：")[1]
          .trim();
        let description = e
          .querySelector("div.info > ul")
          .children[4].children[0].text.trim();

        return {
          id: id,
          title: title,
          subTitle: author,
          description: description,
          cover: e.querySelector("amp-img").attributes["src"],
        };
      }
      let comics = document
        .querySelectorAll("div.bookshelf-items")
        .map((e) => parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },
  };

  /// 单个漫画相关
  comic = {
    // 加载漫画信息
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/comic/${id}`, this.headers);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);

      let title = document.querySelector("h1.comics-detail__title").text.trim();
      let cover = document.querySelector("div.l-content > div > div > amp-img")
        .attributes["src"];
      let author = document
        .querySelector("h2.comics-detail__author")
        .text.trim();
      let tags = document
        .querySelectorAll("div.tag-list > span")
        .map((e) => e.text.trim());
      tags = [...tags.filter((e) => e !== "")];
      let updateTime = document
        .querySelector("div.supporting-text > div > span > em")
        ?.text.trim()
        .replace("(", "")
        .replace(")", "");
      if (!updateTime) {
        const getLastChapterText = () => {
          // 合并所有章节容器（处理可能存在多个列表的情况）
          const containers = [
            ...document.querySelectorAll(
              "#chapter-items, #chapters_other_list"
            ),
          ];
          let allChapters = [];
          containers.forEach((container) => {
            const chapters = container.querySelectorAll(".comics-chapters > a");
            allChapters.push(...Array.from(chapters));
          });
          const lastChapter = allChapters[allChapters.length - 1];
          return (
            lastChapter?.querySelector("div > span")?.text.trim() ||
            "暂无更新信息"
          );
        };
        updateTime = getLastChapterText();
      }
      let description = document
        .querySelector("p.comics-detail__desc")
        .text.trim();
      let chapters = new Map();
      let chapterLinks = document.querySelectorAll(
        "#chapter-items .comics-chapters > a, #chapters_other_list .comics-chapters > a"
      );
      if (chapterLinks.length === 0) {
        // 将倒序的最新章节反转
        chapterLinks = Array.from(
          document.querySelectorAll("div.comics-chapters > a")
        ).reverse();
      }
      for (let c of chapterLinks) {
        const key = this.chapterKey(c.attributes["href"] || "", chapters.size);
        chapters.set(key, c.text.trim());
      }
      let recommend = [];
      for (let c of document.querySelectorAll("div.recommend--item")) {
        if (c.querySelectorAll("div.tag-comic").length > 0) {
          let title = c.querySelector("span").text.trim();
          let cover = c.querySelector("amp-img").attributes["src"];
          let url = c.querySelector("a").attributes["href"];
          let id = url.split("/").pop();
          recommend.push({
            id: id,
            title: title,
            cover: cover,
          });
        }
      }
      // updateTime 将 Y年 M月 D日 转化为 Y-M-D
      let updateDate = updateTime
        .replace(/年/g, "-")
        .replace(/月/g, "-")
        .replace(/日/g, "");

      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        tags: {
          作者: [author],
          标签: tags,
        },
        chapters: chapters,
        recommend: recommend,
        updateTime: updateDate,
      });
    },
    loadEp: async (comicId, epId, readerLanguage = this.lang) => {
      const images = [];
      const seenImages = new Set();
      const seenPages = new Set();
      const slots = String(epId).match(/^(?:(\d+)_)?(\d+)$/);
      if (!slots) throw "Invalid chapter ID: " + epId;
      const section = slots[1] || "0";
      const chapter = slots[2];
      const chapterKey = section === "0" ? chapter : `${section}_${chapter}`;
      // 使用网站目录的公开阅读入口，让网站选择当前可用的阅读域名。
      const readerBaseUrl = `https://${readerLanguage}.${this.domain}`;
      const wrongComic = "包子漫画返回了其他作品的图片，请切换简繁设置或稍后重试";
      let currentPageUrl = `${readerBaseUrl}/user/page_direct?comic_id=${encodeURIComponent(comicId)}&section_slot=${section}&chapter_slot=${chapter}`;

      try {
        while (currentPageUrl) {
          if (seenPages.has(currentPageUrl)) throw "包子漫画章节分页出现循环，请稍后重试";
          if (seenPages.size >= 100) throw "包子漫画章节分页过多，请检查章节链接";
          seenPages.add(currentPageUrl);
          const res = await Network.get(currentPageUrl, { ...this.headers, Referer: `${readerBaseUrl}/` });
          if (res.status !== 200) throw `Invalid status code: ${res.status}`;
          const doc = new HtmlDocument(res.body);
          let nextPageUrl = null;
          try {
            const imageNodes = doc.querySelectorAll(
              ".comic-contain amp-img, .comic-contain img, .comic-article img, .chapter-img amp-img, .chapter-img img"
            );
            let pageImageCount = 0;
            let otherComicImages = 0;
            for (let imgNode of imageNodes) {
              const src = imgNode.attributes["data-src"] || imgNode.attributes["src"];
              if (!src || /^(data:|javascript:)/i.test(src)) continue;
              const imgUrl = this.imageUrl(src, currentPageUrl);
              if (!imgUrl) continue;
              if (!this.isComicImage(imgUrl, comicId)) {
                otherComicImages++;
                continue;
              }
              pageImageCount++;
              if (!seenImages.has(imgUrl)) {
                seenImages.add(imgUrl);
                images.push(imgUrl);
              }
            }
            if (!pageImageCount && otherComicImages) throw wrongComic;
            if (!pageImageCount) throw "包子漫画未返回章节图片，请在浏览器检查网站是否需要验证";
            // 只跟随下一页，避免把下一话也加进当前章节。
            const next = doc.querySelectorAll("a").find((a) =>
              /下一[页頁]/.test(a.text) && a.attributes["href"]
            );
            if (next) {
              nextPageUrl = this.absoluteUrl(next.attributes["href"], currentPageUrl);
              if (this.chapterKey(nextPageUrl, null) !== chapterKey) {
                throw "包子漫画分页链接与当前章节不一致";
              }
            }
          } finally {
            doc.dispose();
          }
          currentPageUrl = nextPageUrl;
        }
        return { images: images };
      } catch (error) {
        // 简体站部分新章节会替换为其他作品，繁体公开页面仍可正常阅读。
        if (error === wrongComic && readerLanguage === "cn") {
          return await this.comic.loadEp(comicId, epId, "tw");
        }
        throw error;
      }
    },
    onImageLoad: () => ({ headers: this.headers }),
  };
}

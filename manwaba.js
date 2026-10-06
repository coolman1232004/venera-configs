/** @type {import('./_venera_.js')} */
class ManWaBa extends ComicSource {
  // Note: The fields which are marked as [Optional] should be removed if not used

  // name of the source
  name = "漫蛙吧";

  // unique id of the source
  key = "manwaba";

  version = "1.0.5";

  minAppVersion = "1.4.0";

  // update url
  url = "https://raw.githubusercontent.com/coolman1232004/venera-configs/main/manwaba.js";

  //修改域名不能用问题
  api = "https://manwaxu.cc/api";

  headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    Referer: "https://manwaxu.cc/",
  };

  coverUrl(url) {
    // 使用新的缓存键，避免 Venera 继续读取旧版缓存的加密封面。
    return typeof url === "string" && url
      ? url.split("#")[0] + "#venera-manwaba-cover-1" : url;
  }

  imageConfig(imageKey) {
    return {
      url: imageKey.split("#")[0],
      headers: this.headers,
      onResponse: (buffer) => this.decryptImage(buffer),
    };
  }

  decryptImage(buffer) {
    const bytes = new Uint8Array(buffer);
    const isImage = (v) => (v[0] === 0xff && v[1] === 0xd8)
      || (v[0] === 0x89 && v[1] === 0x50)
      || (v[0] === 0x47 && v[1] === 0x49)
      || (v[0] === 0x52 && v[1] === 0x49);
    if (isImage(bytes)) return bytes.buffer;
    if (bytes.length <= 16 || (bytes.length - 16) % 16 !== 0) {
      throw new Error("图片数据无效，请重新加载章节");
    }
    // 与网站 BaseUtil.getSecureImageUrl 一致：前 16 字节是 IV。
    const key = Convert.encodeUtf8("0B6666A0-BB59-1381-B746-a0E4C9AC");
    const decoded = new Uint8Array(Convert.decryptAesCbc(
      bytes.slice(16).buffer, key, bytes.slice(0, 16).buffer
    ));
    const padding = decoded[decoded.length - 1];
    if (padding < 1 || padding > 16
      || !decoded.slice(-padding).every((value) => value === padding)
      || !isImage(decoded)) {
      throw new Error("图片解密失败，请确认网站是否更改了图片格式");
    }
    return decoded.slice(0, -padding).buffer;
  }

  init() {
    /**
     * Sends an HTTP request.
     * @param {string} url - The URL to send the request to.
     * @param {string} method - The HTTP method (e.g., GET, POST, PUT, PATCH, DELETE).
     * @param {Object} params - The query parameters to include in the request.
     * @param {Object} headers - The headers to include in the request.
     * @param {string} payload - The payload to include in the request.
     * @returns {Promise<Object>} The response from the request.
     */
    this.fetchJson = async (
      url,
      { method = "GET", params, headers, payload }
    ) => {
      if (params) {
        let params_str = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join("&");
        url += `?${params_str}`;
      }
      headers = { ...this.headers, ...headers };
      if (payload !== undefined) headers["Content-Type"] = "application/json";
      let res = await Network.sendRequest(method, url, headers, payload);
      if (res.status !== 200) {
        throw new Error(`接口请求失败: ${res.status}`);
      }
      let json = JSON.parse(res.body);
      if (json.code !== undefined && json.code !== 200) {
        throw new Error(json.msg || `接口错误: ${json.code}`);
      }
      return json;
    };
    this.logger = {
      error: (msg) => {
        log("error", this.name, msg);
      },
      info: (msg) => {
        log("info", this.name, msg);
      },
      warn: (msg) => {
        log("warning", this.name, msg);
      },
    };
  }

  // explore page list
  explore = [
    {
      // title of the page.
      // title is used to identify the page, it should be unique
      title: this.name,

      /// multiPartPage or multiPageComicList or mixed
      type: "singlePageWithMultiPart",

      /**
       * load function
       * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
       * @returns {{}}
       * - for `multiPartPage` type, return [{title: string, comics: Comic[], viewMore: PageJumpTarget}]
       * - for `multiPageComicList` type, for each page(1-based), return {comics: Comic[], maxPage: number}
       * - for `mixed` type, use param `page` as index. for each index(0-based), return {data: [], maxPage: number?}, data is an array contains Comic[] or {title: string, comics: Comic[], viewMore: string?}
       */
      load: async (page) => {
        let params = {
          page: 1,
          pageSize: 6,
          type: "",
          flag: false,
        };
        const url = `${this.api}/home`;
        const data = await this.fetchJson(url, { params }).then(
          (res) => res.data
        );
        let magnaList = {
          热门: data.comicList,
          最新完整版: data.gufengList,
          最新更新: data.xuanhuanList,
          热门收藏: data.xiaoyuanList,
        };
        const parseComic = (comic) => {
          return new Comic({
            id: comic.id.toString(),
            title: comic.title,
            subTitle: comic.author,
            cover: this.coverUrl(comic.pic),
            tags: comic.tags.split(","),
          });
        };
        let result = {};
        for (let key in magnaList) {
          result[key] = magnaList[key].map(parseComic);
        }
        return result;
      },
    },
  ];

  // categories
  category = {
    /// title of the category page, used to identify the page, it should be unique
    title: this.name,
    parts: [
      {
        // title of the part
        name: "类型",

        // fixed or random or dynamic
        // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
        // if dynamic, need to provide `loader` field, which indicates the function to load comics
        type: "fixed",

        // Remove this if type is dynamic
        categories: [
          "全部",
          "热血",
          "玄幻",
          "恋爱",
          "冒险",
          "古风",
          "都市",
          "穿越",
          "奇幻",
          "其他",
          "搞笑",
          "少男",
          "战斗",
          "重生",
          "逆袭",
          "爆笑",
          "少年",
          "后宫",
          "系统",
          "BL",
          "韩漫",
          "完整版",
          "19r",
          "台版",
        ],

        itemType: "category",
        categoryParams: [
          "",
          "热血",
          "玄幻",
          "恋爱",
          "冒险",
          "古风",
          "都市",
          "穿越",
          "奇幻",
          "其他",
          "搞笑",
          "少男",
          "战斗",
          "重生",
          "逆袭",
          "爆笑",
          "少年",
          "后宫",
          "系统",
          "BL",
          "韩漫",
          "完整版",
          "19r",
          "台版",
        ],
      },
    ],
    // enable ranking page
    enableRankingPage: false,
  };

  /// category comic loading related
  categoryComics = {
    /**
     * load comics of a category
     * @param category {string} - category name
     * @param param {string?} - category param
     * @param options {string[]} - options from optionList
     * @param page {number} - page number
     * @returns {Promise<{comics: Comic[], maxPage: number}>}
     */
    load: async (category, param, options, page) => {
      let pathMap = {
        "": "/cate",
        "热血": "/cate/hotblooded",
        "玄幻": "/cate/xuanhuan",
        "恋爱": "/cate/romance",
        "冒险": "/cate/adventure",
        "古风": "/cate/historical",
        "都市": "/cate/urban",
        "穿越": "/cate/transmigration",
        "奇幻": "/cate/fantasy",
        "搞笑": "/cate/comedy",
        "少男": "/cate/shounen",
        "战斗": "/cate/action",
        "重生": "/cate/rebirth",
        "逆袭": "/cate/counterattack",
        "爆笑": "/cate/hilarious",
        "少年": "/cate/youth",
        "系统": "/cate/system",
        "BL": "/cate/bl",
        "韩漫": "/cate/manhwa",
        "完整版": "/cate/fullversion",
        "19r": "/cate/19plus",
        "台版": "/cate/taiwanver",
      };
      let url = this.api + (pathMap[param] || "/cate");
      let payload = JSON.stringify({
        page: {
          page: page,
          pageSize: 10,
        },
        category: "comic",
        sort: parseInt(options[2]),
        comic: {
          status: parseInt(options[0] == "2" ? -1 : options[0]),
          day: parseInt(options[1]),
          tag: param,
        },
        video: {
          year: 0,
          typeId: 0,
          typeId1: 0,
          area: "",
          lang: "",
          status: -1,
          day: 0,
        },
        novel: {
          status: -1,
          day: 0,
          sortId: 0,
        },
      });

      let data = await this.fetchJson(url, {
        method: "POST",
        payload,
      }).then((res) => res.data.list);

      const parseComic = (comic) => {
        return new Comic({
          id: comic.url.split("/").pop(),
          title: comic.title,
          subTitle: comic.author,
          cover: this.coverUrl(comic.pic),
          tags: comic.tags.split(","),
          description: comic.intro,
          status: comic.status == 0 ? "连载中" : "已完结",
        });
      };
      return {
        comics: data.map(parseComic),
        maxPage: 100,
      };
    },
    // provide options for category comic loading
    optionList: [
      {
        options: ["2-全部", "0-连载中", "1-已完结"],
      },
      {
        options: [
          "0-全部",
          "1-周一",
          "2-周二",
          "3-周三",
          "4-周四",
          "5-周五",
          "6-周六",
          "7-周日",
        ],
      },
      {
        options: ["0-更新", "1-新作", "2-畅销", "3-热门", "4-收藏"],
      },
    ],
  };

  /// search related
  search = {
    /**
     * load search result
     * @param keyword {string}
     * @param options {string[]} - options from optionList
     * @param page {number}
     * @returns {Promise<{comics: Comic[], maxPage: number}>}
     */
    load: async (keyword, options, page) => {
      const pageSize = 20;
      let url = `${this.api}/search`;
      let params = {
        keyword,
        type: "mh",
        page,
        pageSize,
      };
      let data = await this.fetchJson(url, { params }).then((res) => res.data);
      let total = data.total;
      let comics = data.list.map((item) => {
        return new Comic({
          id: item.id.toString(),
          title: item.title,
          subTitle: item.author,
          cover: this.coverUrl(item.cover),
          tags: item.tags.split(","),
          description: item.description,
          status: item.status == 0 ? "连载中" : "已完结",
        });
      });
      let maxPage = Math.ceil(total / pageSize);
      return {
        comics,
        maxPage,
      };
    },
  };

  /// single comic related
  comic = {
    /**
     * load comic info
     * @param id {string}
     * @returns {Promise<ComicDetails>}s
     */
    loadInfo: async (id) => {
      let url = `${this.api}/comic/${id}`;
      let data = await this.fetchJson(url, { payload: undefined }).then(
        (res) => res.data
      );
      this.logger.warn(`loadInfo: ${data}`);
      let chapterId = data.id;
      let chapterApi = `${this.api}/comic/chapter`;
      let params = {
        comicId: chapterId,
        page: 1,
        pageSize: 1,
      };
      let pageRes = await this.fetchJson(chapterApi, { params });
      let total = pageRes.pagination.total;

      let chapters = new Map();
      for (let page = 1; chapters.size < total; page++) {
        const chapterRes = await this.fetchJson(chapterApi, {
          params: { ...params, page, pageSize: 100 },
        });
        const before = chapters.size;
        for (const item of chapterRes.data || []) {
          chapters.set(item.id.toString(), item.title.toString());
        }
        if (chapters.size === before) throw new Error("章节列表不完整，请重试");
      }

      return new ComicDetails({
        title: data.title.toString(),
        subTitle: data.author.toString(),
        cover: this.coverUrl(data.cover),
        tags: {
          类型: data.tags.split(","),
          状态: data.status == 0 ? "连载中" : "已完结",
        },
        chapters,
        description: data.intro,
        updateTime: new Date(data.editTime * 1000).toLocaleDateString(),
      });
    },
    /**
     * load images of a chapter
     * @param comicId {string}
     * @param epId {string?}
     * @returns {Promise<{images: string[]}>}
     */
    loadEp: async (comicId, epId) => {
      let imgApi = `${this.api}/comic/image/${epId}`;
      const params = {
        page_size: 100,
        imageSource: "https://tu.mhttu.cc",
      };
      const images = [];
      const seen = new Set();
      for (let page = 1; ; page++) {
        const data = (await this.fetchJson(imgApi, { params: { ...params, page } })).data;
        const before = images.length;
        for (const item of data.images || []) {
          if (item.url && !seen.has(item.url)) {
            seen.add(item.url);
            images.push(item.url);
          }
        }
        const total = Number(data.pagination?.total || 0);
        if (!total || images.length >= total) break;
        if (images.length === before) throw new Error("章节图片列表不完整，请重试");
      }
      if (!images.length) throw new Error("本章没有可阅读的图片");
      return {
        images,
      };
    },
    onImageLoad: (imageKey) => this.imageConfig(imageKey),
    onThumbnailLoad: (imageKey) => this.imageConfig(imageKey),
  };
}

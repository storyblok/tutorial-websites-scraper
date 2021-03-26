import axios from 'axios'
import jsdom from 'jsdom'
import getFavicons from 'get-website-favicon'
import url from 'url'

const { JSDOM } = jsdom

export default class SitesScraper {
  constructor(siteUrl) {
    this.url = siteUrl.replace(/\/$/, '')
  }

  absoluteUrl(docUrl) {
    // Skipping data image
    if(docUrl.includes('data:image')) {
      return ''
    }
    if (!url.parse(docUrl).hostname) {
      docUrl = docUrl.replace(/^\//, '')
      docUrl = `${this.url}/${docUrl}`
    }
    return docUrl
  }

  async getLogo() {
    await this.getHome()
    let logo = ''
    if (this.dom) {
      logo = await this.getLogoFromManifest() || this.getSchemaLogo() || await this.getFavicon() || this.getHtmlLogo()
    }
    return logo
  }

  async getHome() {
    try {
      let response = await axios.get(this.url);
      if (response.status === 200) {
        const virtualConsole = new jsdom.VirtualConsole();
        this.dom = new JSDOM(response.data, { virtualConsole });
      }
    } catch (err) {
      this.dom = null;
    }
  }

  async getFavicon() {
    return new Promise((resolve) => {
      try {
        getFavicons(this.url).then((data) => {
          if(!data.icons?.length) {
            resolve()
          }
          data.icons.sort((a, b) => {
            if (!a.sizes || !b.sizes) {
              return 0
            }
            let aSize = parseInt(a.sizes.split('x')[0])
            let bSize = parseInt(b.sizes.split('x')[0])
            if (aSize > bSize) {
              return -1
            }
            if (aSize < bSize) {
              return 1
            }
            return 0
          })
          resolve(data.icons[0])
        })
      } catch(err) {
        resolve()
      }
    })
  }

  async getLogoFromManifest() {
    let manifest = await this.getManifest()
    if (manifest?.icons?.length) {
      manifest.icons.sort((a, b) => {
        if (!a.sizes || !b.sizes) {
          return 0
        }
        let aSize = parseInt(a.sizes.split('x')[0])
        let bSize = parseInt(b.sizes.split('x')[0])
        if (aSize > bSize) {
          return -1
        }
        if (aSize < bSize) {
          return 1
        }
        return 0
      })
      return this.absoluteUrl(manifest.icons[0].src)
    } else {
      return ''
    }
  }

  async getManifest() {
    let manifestLink = this.dom.window.document.querySelector('[rel="manifest"]')
    let manifest = {}
    if (manifestLink) {
      try {
        let response = await axios.get(this.absoluteUrl(manifestLink.href))
        if (response.status === 200) {
          manifest = response.data
        }
      } catch (err) { }
    }
    return manifest
  }

  getHtmlLogo() {
    let headerNodes = Array.from(this.dom.window.document.querySelectorAll('header *')).filter(el => typeof el.className === 'string' && el.className.includes('logo'))
    let logo = ''
    headerNodes.some((el) => {
      if (el.nodeName.toLowerCase() === 'img') {
        logo = this.absoluteUrl(el.src)
        return true
      } else if (el.nodeName.toLowerCase() === 'svg') {
        logo = el.outerHTML
        return true
      } else {
        try {
          // Get the first image inside the element
          const virtualConsole = new jsdom.VirtualConsole()
          let elNode = new JSDOM(el.outerHTML, { virtualConsole })
          let image = elNode.window.document.querySelector('img, svg')
          if (image && image.nodeName.toLowerCase() === 'img') {
            logo = this.absoluteUrl(image.src)
            return true
          }
          if (image && image.nodeName.toLowerCase() === 'svg') {
            logo = image.outerHTML
            return true
          }
        } catch (err) { }
      }
    })
    return logo
  }

  getSchemaLogo() {
    let ldjson = this.dom.window.document.querySelectorAll('script[type*="application/ld+json"]')
    let logo = null
    Array.from(ldjson).some((tag) => {
      try {
        let jsonData = JSON.parse(tag.innerHTML)
        if (jsonData.logo && typeof jsonData.logo === 'string') {
          logo = jsonData.logo
        } else if (jsonData.logo && typeof jsonData.logo === 'object' && jsonData.logo.url) {
          logo = jsonData.logo.url
        } else if (jsonData.image && typeof jsonData.image === 'string') {
          logo = jsonData.image
        } else if (jsonData.image) {
          logo = jsonData.image[0]
        }
      } catch (err) { }
    })
    return logo
  }
}
import async from 'async'
import csv from 'csv-parser'
import FormData from 'form-data'
import fs, { existsSync } from 'fs'
import axios from 'axios'
import SitesScraper from './sites-scraper.js'
import slugify from 'slugify'
import StoryblokClient from 'storyblok-js-client'

export default class EntriesImporter {
  log = []
  websites = []

  constructor(oauth_token, input_file, space_id, folder_id) {
    this.oauth_token = oauth_token
    this.input_file = input_file
    this.space_id = space_id
    this.folder_id = folder_id
  }

  /**
   * Get the space token and setup the Storyblok js client
   */
  async setupStoryblokClient() {
    try {
      this.storyblok = new StoryblokClient({
        oauthToken: this.oauth_token
      })
      const space_request = await this.storyblok.get(`spaces/${this.space_id}`)
      this.target_space_token = space_request.data.space.first_token
      this.storyblok = new StoryblokClient({
        accessToken: this.target_space_token,
        oauthToken: this.oauth_token,
        rateLimit: 3
      })
    } catch (err) {
      console.log('Error trying to retrieve the space token. Please double check the target space id and the OAUTH token.')
    }
  }

  /**
   * Upload an asset
   * @param {string} image The image url
   * @return {promise}
   */
  async uploadLogo(logo) {
    return new Promise(async (resolve) => {
      try {
        let logo_data = ''
        let filename = ''
        if (logo.includes('<svg')) {
          logo_data = logo
          filename = 'logo.svg'
        } else {
          logo_data = (await axios.get(logo, {responseType: 'arraybuffer'})).data
          filename = logo.split('?')[0].split('/').pop()
        }
        if(!logo_data) {
          resolve()
        }
        const new_asset_request = await this.storyblok.post(`spaces/${this.space_id}/assets`, { filename: filename })
        const signed_request = new_asset_request.data
        let form = new FormData()
        for (let key in signed_request.fields) {
          form.append(key, signed_request.fields[key])
        }
        form.append('file', logo_data)
        form.submit(signed_request.post_url, (err) => {
          if (err) {
            resolve()
          } else {
            resolve(signed_request)
          }
        })
      } catch (err) {
        resolve()
      }
    })
  }

  /**
   * Return the slug of an entry
   * @param {object} website The entry object
   * @return {string}
   */
  storySlug(website) {
    return slugify(website.name, { replacement: '-', lower: true, strict: true })
  }

  /**
   * Get the payload for requests
   * @param {object} website The entry object
   * @param {object} story The existing story data, in case it's not a new entry
   * @return {object} The payload object
   */
  async getPayload(website, story) {
    let uploadLogo = true

    let story_data = {}
    if(story) {
      story_data.story = story
    } else {
      story_data.story = {
        name: website.name,
        slug: this.storySlug(website),
        parent_id: this.folder_id
      }
    }
    story_data.story.content = {
      component: 'website',
      website: website.url
    }
    if (story?.published_at) {
      story_data.publish = 1
    }

    if (story && website.logo) {
      const currentLogo = story.content.logo && story.content.logo.filename ? story.content.logo.filename.split('/')[story.content.logo.filename.split('/').length - 1].split('?')[0] : ''
      const newLogo = website.logo.split('/')[website.logo.split('/').length - 1].split('?')[0]
      if (currentLogo === newLogo) {
        uploadLogo = false
      }
    }
    if (website.logo && uploadLogo) {
      const logo = await this.uploadLogo(website.logo)
      if (logo?.id) {
        story_data.story.content.logo = {
          "id": logo.id,
          "alt": `${website.name} Logo`,
          "filename": logo.pretty_url,
          "fieldtype": "asset",
        }
      }
    } else if(story?.content.logo) {
      story_data.story.content.logo = story.content.logo
    }

    return story_data
  }

  /**
   * Store a new story
   * @param {object} payload The payload for the request
   * @return {void}
   */
  async createStory(website) {
    try {
      let payload = await this.getPayload(website)
      await this.storyblok.post(`spaces/${this.space_id}/stories`, payload)
    } catch (err) {
      this.log.push(`Error ${JSON.stringify(err)} when saving story ${website.name}`)
    }
  }

  /**
   * Update a story
   * @param {object} payload The payload for the request
   * @return {void}
   */
  async updateStory(website, story) {
    try {
      let payload = await this.getPayload(website, story)
      await this.storyblok.put(`spaces/${this.space_id}/stories/${payload.story.id}`, payload)
    } catch (err) {
      this.log.push(`Error ${JSON.stringify(err)} when updating story ${JSON.stringify(website.name)}`)
    }
  }

  /**
   * Read data from the cache 
   */
  readCache() {
    if(fs.existsSync('./data/cache.json')) {
      try {
        this.websites = JSON.parse(fs.readFileSync('./data/cache.json'))
        console.log('Websites data from cache')
      } catch(err) {
        console.log(err)
      }
    }
  }

  /**
   * Get websites from the csv and scrape data from their sites
   */
  async getWebsites() {
    this.readCache()
    if(!this.websites.length) {
      return new Promise((resolve, reject) => {
        if (fs.existsSync(this.input_file)) {
          fs.createReadStream(this.input_file)
            .pipe(csv())
            .on('data', async (website) => {
              this.websites.push(website)
            })
            .on('end', async () => {
              console.log(`Scraping logos from ${this.websites.length} websites.`)
              process.stdout.write("\n"); 
              let total = 0
              
              async.eachOfLimit(this.websites, 15, async (website, index) => {
                if (website.url) {
                  if (!website.url.includes('http')) {
                    website.url = `https://${website.url}`
                  }
                  let scraper = new SitesScraper(website.url)
                  this.websites[index].logo = await scraper.getLogo()
                }
                process.stdout.clearLine()
                process.stdout.cursorTo(0)
                process.stdout.write(`${++total} of ${this.websites.length} sites scraped.`)
              }, (err) => {
                if(!err) {
                  fs.writeFileSync('./data/cache.json', JSON.stringify(this.websites, null, 2))
                  resolve()
                } else {
                  reject(`Some import error happened`)
                  console.log(err)
                }
              })
            })
        } else {
          reject(`The input file "${this.input_file}" doesn't exist.`)
        }
      })
    }
  }

  /**
   * Import data into Storyblok
   */
  async import() {
    process.stdout.write(`Writing data into Storyblok`);
    let folder
    if(this.folder_id) {
      try {
        folder = await this.storyblok.get(`spaces/${this.space_id}/stories/${this.folder_id}`)
      } catch(err) {
        console.log('Error while trying to get the folder')
      }
    }
    let total = 0
    async.eachLimit(this.websites, 15, async (website) => {
      try {
        if(folder) {
          const story = (await this.storyblok.get(`cdn/stories/${folder.data.story.full_slug}/${this.storySlug(website)}`, { version: 'draft' })).data.story
        } else {
          const story = (await this.storyblok.get(`cdn/stories/${this.storySlug(website)}`, { version: 'draft' })).data.story
        }
        await this.updateStory(website, story)
      } catch (err) {
        await this.createStory(website)
      }
      process.stdout.clearLine()
      process.stdout.cursorTo(0)
      process.stdout.write(`${++total} of ${this.websites.length} Stories saved.`)
    }, (err) => {
      if(err) {
        console.log(err)
      }
      fs.writeFileSync('./data/log.json', JSON.stringify(this.log, null, 2))
    })
  }

  /**
   * Start the import process reading the data from the cache or
   * scrapring the data gain
   */
  async start() {
    if(!existsSync('./data')) {
      fs.mkdirSync('./data')
    }
    await this.setupStoryblokClient()
    try {
      await this.getWebsites()
      await this.import()
    } catch(err) {
      console.log('Import failed because of an error:')
      console.log(err)
    }  
  }
}
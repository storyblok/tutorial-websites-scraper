# Websites Scraper

This project is a simple websites scraper that reads a list of sites from a csv file and scrapes data out of them, then it stores the data into Storyblok. 
The script will create also a local cache of the extracted data and a log in case of errors.

## Running the script

```
// make sure dependencies are installed
npm install 

// starts the scraper
npm run scrape
```

## Other commands

```
// clear the cache of scraped information
npm clear cache
```

## Csv sample

This is the format of the CSV file you can use

```
name,url
Storyblok,https://www.storyblok.com
NuxtjJS,https://nuxtjs.org/
Next.js,https://nextjs.org/
```
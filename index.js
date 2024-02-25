import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'node-html-parser';
import https from 'https';

// const path = "/Users/utkarsh/Downloads"
const path = "."
const readFileName = "export_5833701.html"
const writeFileName = "utkarsh.sql"

function stringifyDate(dateObject) {
  // Format the date object as a string in "dd-mm-yyyy" format
  const day = ('0' + dateObject.getDate()).slice(-2)
  const month = ('0' + (dateObject.getMonth() + 1)).slice(-2)
  const year = dateObject.getFullYear()
  const formattedDate = `${year}-${month}-${day}`;

  return `${formattedDate} 00:00:00`;
}

async function getHTMLFromURL(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(data);
      });
    });

    request.on('error', (error) => {
      reject(error);
    });
  });
}

async function fetchWebpage(webpageURL) {
  try {
    const html = await getHTMLFromURL(webpageURL);
    console.log(html);
    return html;
  } catch (error) {
    console.error('Error:', error);
  }
}

function getHtml() {
  const fullPath = `${path}/${readFileName}`;

  return readFileSync(fullPath, 'utf8');
}

async function getPoemFromProfilePages(pages = 1) {
  let allPoems = []
  for (let page = 1; page <= pages; page++) {
    const url = `https://allpoetry.com/items/read_by/Ajulea?kind=poem&page=${page}`;
    console.log(`url: ${url}`);
    const html = await fetchWebpage(url);
    const poems = getPostDataFromProfileWebpage(html);
    allPoems = [...allPoems, ...poems];
  }

  return allPoems;
}

async function getHtmlFromWebpage(url) {
  const html = await fetchWebpage(url);

  return html;
}

function writeSql(sql) {
  const fullPath = `${path}/${writeFileName}`;

  writeFileSync(fullPath, sql);

  console.log(`Written to ${fullPath}`);
}

function getPostDataFromProfileWebpage(html) {
  const root = parse(html);
  const poemsDiv = root.querySelectorAll('.items_group.inf .fonted');
  const poems = []
  for (const poemDiv of poemsDiv) {
    // console.log(title.toString());
    const rawHtml = poemDiv.toString();
    const titleElement = poemDiv.querySelector('h1.title');
    const title = titleElement.text;

    const poemElement = poemDiv.querySelector('.poem_body>div');
    poemElement.removeAttribute("class");
    const rawBody = poemElement.toString();
    const body = poemElement.text;

    const timeElement = poemDiv.querySelector('.poem_body div.copyright abbr.timeago');
    let dateString = null;
    if (timeElement) {
      const timestamp = timeElement.getAttribute('title');
      console.log(`timestamp: ${timestamp}`);
      const date = new Date(timestamp);
      dateString = stringifyDate(date);
      console.log(`dateString: ${dateString}`);
    }
    // console.log(title);
    console.log(body);

    poems.push({
      rawHtml,
      title,
      rawBody,
      body,
      date: `"${dateString}"`,
    });
  }

  return poems;
}

function getPostData(html) {
  const root = parse(html);
  const poemsDiv = root.querySelectorAll('div.p');
  const poems = []
  for (const poemDiv of poemsDiv) {
    // console.log(title.toString());
    const rawHtml = poemDiv.toString();
    const titleElement = poemDiv.querySelector('h2.title');
    const title = titleElement.text;

    const poemElement = poemDiv.querySelector('div.body');
    poemElement.removeAttribute("class");
    const rawBody = poemElement.toString();
    const body = poemElement.text;
    // console.log(title);
    console.log(body);

    poems.push({
      rawHtml,
      title,
      rawBody,
      body
    });
  }

  return poems;
}

function getInsertSql(headers, data) {
  const keys = getInsertSqlKeys(headers);
  const values = getInsertSqlValues(data)

  return `insert into wp_posts (${keys}) values ${values};`;
}

function getInsertSqlKeys(headers) {
  return headers.join(', ');
}

function getInsertSqlValues(poems) {
  const values = [];
  for (const poem of poems) {
    const valuesString = poem.join(', ')

    values.push(`(${valuesString})`)
  }

  return values.join(', ');
}

function getHeaders() {
  return [
    "post_author",
    "post_content",
    "post_title",
    "post_excerpt",
    "post_date",
    "post_date_gmt",
    "post_name",
  ];
}

function getExcerpt(body) {
  body = body.replace(/\n/g, " ");

  body = body.slice(0, 250).trim();

  return `${body}...`;
}

function getPostName(title) {
  const words = title
    .split(" ")
    .filter(word => word.trim().length > 0)
    .map(word => word.toLowerCase())
    .map(word => word.replace(/('|,|\.|&|;|:)/g, ""));

  return words.join('-');
}

function sanitize(text) {
  return text.replace(/"/g, "\\\"");
}

function getDate(text) {
  // Extract the date string using regular expressions
  const dateMatch = text.match(/by Ajulea on (\w+\s+\d+,\s+\d{4})\./);

  if (!dateMatch) {
    console.log("text");
    console.log(JSON.stringify(text));
    console.log("dateMatch");
    console.log(dateMatch);
    // Handle case where date is not found
    // return null;
    throw new Error("safd")
  }

  const dateString = dateMatch[1];

  // Convert the date string to a Date object
  const dateObject = new Date(dateString);
  const date = stringifyDate(dateObject);

  return `"${date}"`;
}

function buildData(poems) {
  const author = "1";
  const defaultDate = "GETDATE()";

  const data = [];
  for (const poem of poems) {
    console.log(poem)
    const excerpt = sanitize(getExcerpt(poem.body));
    const rawBody = sanitize(poem.rawBody);
    const title = sanitize(poem.title);
    const postName = getPostName(title);
    console.log("poem.text")
    console.log(poem.text)
    const date = poem.date || getDate(poem.rawHtml) || defaultDate;

    data.push([
      author,
      `"${rawBody}"`,
      `"${title}"`,
      `"${excerpt}"`,
      date,
      date,
      `"${postName}"`,
    ]);
  }

  // Reverse for cronological order
  return data.reverse();
}

async function main({useProfilePage = true, pages = 1}) {
  let html = "";
  let poems = [];
  if (useProfilePage) {
    poems = await getPoemFromProfilePages(pages);
    poems = poems.slice(0, 4);
    console.log(poems)
    console.log(poems.length)
  } else {
    html = getHtml();
    poems = getPostData(html);
    console.log(poems)
  }


  const data = buildData(poems);
  // console.log(data[1]);

  const headers = getHeaders();
  const sql = getInsertSql(headers, data);
  // const sql = getInsertSql(headers, [data[1]]);

  console.log(sql);

  writeSql(sql);
}


// main()

(async ()=> {
  const options = {
    useProfilePage: true,
    pages: 2,
  };
  await main(options);
})();

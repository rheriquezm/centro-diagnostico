import { stripHtml } from "./util.js";

function matchTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  return match ? match[1].trim() : "";
}

function matchAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  const match = block.match(re);
  return match ? match[1] : "";
}

export function parseFeed(xml, limit = 40) {
  const text = String(xml ?? "");
  const rssItems = text.split(/<item[\s>]/i).slice(1);
  const atomItems = text.split(/<entry[\s>]/i).slice(1);
  const isAtom = rssItems.length === 0;
  const blocks = (isAtom ? atomItems : rssItems).slice(0, limit);

  return blocks.map((block) => {
    const title = stripHtml(matchTag(block, "title"));
    const link = isAtom
      ? matchAttr(block, "link", "href") || stripHtml(matchTag(block, "link"))
      : stripHtml(matchTag(block, "link"));
    const date =
      matchTag(block, "pubDate") ||
      matchTag(block, "published") ||
      matchTag(block, "updated");
    const description =
      matchTag(block, "description") ||
      matchTag(block, "summary") ||
      matchTag(block, "content");
    return {
      title,
      link,
      date: stripHtml(date),
      description: stripHtml(description),
    };
  });
}

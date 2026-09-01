import Script from "next/script";
import React from "react";
import {
  renderBoardPage,
  type BoardViewModel,
} from "../views/outbid-reference-board";

type RenderedDocument = {
  css: string;
  markup: string;
  scripts: string[];
};

function splitRenderedDocument(documentHtml: string): RenderedDocument {
  const style = /<style>([\s\S]*?)<\/style>/.exec(documentHtml)?.[1];
  const body = /<body>([\s\S]*?)<\/body>/.exec(documentHtml)?.[1];
  if (!style || !body) {
    throw new Error("reference_document_invalid");
  }
  const scripts = Array.from(
    body.matchAll(/<script>([\s\S]*?)<\/script>/g),
    (match) => match[1] ?? "",
  );
  return {
    css: style,
    markup: body.replaceAll(/<script>[\s\S]*?<\/script>/g, ""),
    scripts,
  };
}

export function adaptReferenceDocument(documentHtml: string): string {
  return documentHtml
    .replace('name="productUrl"', 'name="listenUrl"')
    .replace('name="whyTestThisToday"', 'name="track"')
    .replace('name="venueName"', 'name="artist"')
    .replace("Why test this today", "Track")
    .replace("What a seller should try this morning", "Track title for this opening")
    .replace(
      "A short, specific reason helps sellers decide what to test.",
      "The track title appears on the paid placement.",
    )
    .replace("Choose a category and enter venue details", "Choose a category and enter track details")
    .replace("Weekend venue details", "Track details")
    .replace("Venue details", "Track details")
    .replace("Venue name", "Artist")
    .replace('placeholder="Venue name"', 'placeholder="Artist name"')
    .replaceAll(/href="\/r\/([^"#?]+)"/g, 'href="/click/$1"')
    .replaceAll(/data-target="\/r\/([^"#?]+)"/g, 'data-target="/click/$1"');
}

export function OutbidReferenceFixturePage({
  model,
}: {
  model: BoardViewModel;
}) {
  const rendered = splitRenderedDocument(
    adaptReferenceDocument(renderBoardPage(model)),
  );
  const boot = `document.title = "Playlist Headline"; document.documentElement.classList.remove("dark"); try { localStorage.setItem("theme", "light"); } catch (error) {}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
      <div
        className="outbid-reference-root"
        data-reference-fixture-root=""
        dangerouslySetInnerHTML={{ __html: rendered.markup }}
      />
      {rendered.scripts.map((source, index) => (
        <Script
          id={`outbid-reference-script-${index}`}
          key={`outbid-reference-script-${index}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: index === 0 ? `${boot}\n${source}` : source,
          }}
        />
      ))}
    </>
  );
}

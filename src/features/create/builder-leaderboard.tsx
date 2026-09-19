"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { FriendSprite } from "@/src/components/art/friend-sprite";
import { GenesisPortrait } from "@/src/components/art/hero-face";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import { createContent, createLinks } from "@/src/content/create";

export function BuilderLeaderboard() {
  const copy = createContent.leaderboard;
  const [activeCategory, setActiveCategory] = useState(copy.categories.findIndex(category => category.id === "activity"));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % copy.categories.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + copy.categories.length) % copy.categories.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = copy.categories.length - 1;
    else return;
    event.preventDefault();
    setActiveCategory(next);
    tabs.current[next]?.focus();
  }

  return <section className="create-leaderboard create-container create-section" id="leaderboard" aria-labelledby="create-leaderboard-title">
    <div className="create-section-heading create-leaderboard-heading">
      <div><h2 id="create-leaderboard-title">{copy.title}</h2><p>{copy.description}</p></div>
      <div className="create-prize-pool"><Icon name="gift" size={24} /><strong>{createContent.vibeathon.prize}</strong><span>{copy.poolLabel}</span></div>
    </div>

    <div className="create-leaderboard-tabs" role="tablist" aria-label={copy.tabsLabel}>
      {copy.categories.map((category, index) => <button
        key={category.id}
        ref={element => { tabs.current[index] = element; }}
        type="button"
        role="tab"
        id={`create-category-${category.id}`}
        aria-controls={`create-ranking-${category.id}`}
        aria-selected={activeCategory === index}
        tabIndex={activeCategory === index ? 0 : -1}
        onClick={() => setActiveCategory(index)}
        onKeyDown={event => moveTab(event, index)}
      >{category.name}</button>)}
    </div>

    {copy.categories.map((category, index) => <div
      key={category.id}
      role="tabpanel"
      id={`create-ranking-${category.id}`}
      aria-labelledby={`create-category-${category.id}`}
      hidden={activeCategory !== index}
      tabIndex={0}
    >
      <p className="create-leaderboard-category" id={`create-category-description-${category.id}`}>{category.description}</p>
      <div className="create-leaderboard-table">
        <table aria-labelledby={`create-category-${category.id}`} aria-describedby={`create-category-description-${category.id}`}>
          <thead><tr>{copy.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{copy.prizes.map(prize => <tr key={prize.rank}>
            <th scope="row">#{prize.rank}</th>
            <td className="create-leaderboard-builder">{copy.pendingBuilder}</td>
            <td className="create-leaderboard-points">—</td>
            <td><div className="create-leaderboard-prize">
              <div><strong>{prize.cash}</strong><span>+ {prize.nft}</span></div>
              <span className="create-leaderboard-art" data-collection={prize.collection} aria-hidden="true">
                {prize.collection === "genesis" ? <GenesisPortrait size={48} compact /> : <FriendSprite specimen={3} size={48} />}
              </span>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>)}

    <div className="create-leaderboard-prize-details"><strong>{copy.morePrizes}</strong></div>
    <div className="create-leaderboard-foot"><p>{copy.prizeDetails}</p><Button href={createLinks.vibeathon} iconRight="external-link">{createContent.vibeathon.action}</Button></div>
  </section>;
}

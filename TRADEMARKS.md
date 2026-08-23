# Trademarks

Assay's tracker library (`/library`) names real sites and shows each one's brand
mark to identify it. That is nominative use — a brand's own mark identifying
that brand — and it does not imply endorsement, sponsorship or affiliation.

Every mark shipped here was checked against its owner's published policy before
it was added, and the path data is committed to this repository (copied from
[simple-icons](https://github.com/simple-icons/simple-icons), CC0-1.0) so a
self-hosted install renders it offline. The icon *files* are public domain; the
underlying marks are not, and remain the property of their owners. No mark is
recoloured, redrawn or otherwise altered.

## Marks shipped, and the sentence that permits it

**GitHub** — [github.com/logos](https://github.com/logos): *"Use a permitted
GitHub logo to link to GitHub"* and *"Use the permitted GitHub logos less
prominently than your own company or product name or logo."* Rendered
unaltered, at published proportions, smaller than Assay's own wordmark. Note
that the same page also says *"Do not use GitHub trademarks, logos, or artwork
without GitHub's prior written permission"* — the two statements sit beside each
other in GitHub's published text and GitHub has not reconciled them; this
repository relies on the explicit permission.

**Wikipedia** — [Wikimedia Trademark Policy §3.6, "Refer to Wikimedia sites
(nominative use)"](https://foundation.wikimedia.org/wiki/Policy:Trademark_policy):
*"You may use all Wikimedia marks on your own website as a hyperlink to the
Wikimedia sites. The use of logos in hyperlinks should follow the Visual
Identity Guidelines (e.g., the marks may be resized, but not modified in any
other way)."*

> The Wikipedia puzzle-globe logo is a trademark of the Wikimedia Foundation and
> is used with the permission of the Wikimedia Foundation. We are not endorsed
> by or affiliated with the Wikimedia Foundation.

**MDN Web Docs** — [Mozilla Trademark
Guidelines](https://www.mozilla.org/en-US/foundation/trademarks/policy/), under
what may be done without specific permission: *"Use Mozilla logos in visuals to
truthfully refer to and/or to link to the applicable programs, products,
services and technologies hosted on Mozilla servers."*

> MDN Web Docs is a trademark of the Mozilla Foundation in the US and other
> countries.

## Marks deliberately not shipped

These four cards carry a neutral glyph. An altered or approximated logo would be
worse than no logo, so none was drawn.

**Amazon** — [Amazon Trademark Usage
Guidelines](https://www.amazon.com/gp/help/customer/display.html?nodeId=GNYNL3A8HPATWCH8):
*"You may only use the specific trademarks identified by Amazon ... and only in
materials that have been approved in advance, in writing, by Amazon"*, and *"The
Marks must appear by themselves, with reasonable spacing between each side of a
Mark and other visual, graphic or textual elements."* A catalogue of cards is
neither pre-approved nor a mark appearing by itself. simple-icons removed its
Amazon icon for the same reason
([PR #13056](https://github.com/simple-icons/simple-icons/pull/13056)) and
auto-closes requests to re-add it.

**arXiv** — [arXiv brand
guidelines](https://info.arxiv.org/brand/brand-guidelines.html): *"Use of the
name arXiv and associated logos, web addresses, and colors are only allowed for
the purpose of acknowledging use of arXiv's API or data from the arXiv corpus."*
Assay's arXiv tracker reads a listing page's HTML rather than the API, so the
one permitted purpose does not cover it.

**PyPI** — the [PSF trademark policy](https://www.python.org/psf/trademarks/)
enumerates the Python, PyCon and PyLadies marks and is silent on a PyPI mark.
Where it grants nominative use of a Python logo it attaches a condition: the
logos *"should be accompanied by a symbol for unregistered trademarks ... This
may not be removed or obscured and must always be included with the logo."* A
38px glyph in a card cannot carry that legibly, so the card carries no mark.

**Any site** names no brand and so has none to show.

## The Bright Data brand cards carry a letter, not a logo

The library now also lists twenty-eight brands whose data Bright Data's
prebuilt scrapers collect — LinkedIn, Instagram, TikTok, Zillow, Shopee and so
on. **None of them shows its owner's mark.** Twenty-five published policies
were read before that was decided, and the verdicts are below so that nobody
has to read them twice.

Each of those cards carries **Assay's own artwork** instead: the brand's initial
letter in a tinted tile. It reproduces no logo, borrows no trade dress, and the
tint comes from a hash of the card's id rather than from the brand's own colour,
so no card approximates the palette its owner uses. Where a mark has already
been cleared and the brand is the same — GitHub, Wikipedia — the cleared mark is
used, because it is the same permission.

### What the twenty-five policies say

| Brand | Verdict | Source |
|---|---|---|
| LinkedIn | requires permission | brand.linkedin.com/in-logo, /policies |
| Instagram | permits, **conditionally** | meta.com/brand/resources/instagram/instagram-brand/ |
| Threads | permits, **conditionally** | meta.com/brand/resources/threads/ |
| Facebook | requires permission | meta.com/brand/resources/facebook/logo/ |
| TikTok | requires permission | tiktokbrandhub.com/legal |
| YouTube | permits, but scoped to API clients | developers.google.com/youtube/terms/branding-guidelines |
| Google | permits, but not for business purposes | about.google/brand-resource-center/brand-elements/ |
| X (Twitter) | requires permission | about.x.com brand guidelines PDF |
| Reddit | requires permission | redditinc.com/brand |
| Pinterest | requires permission | business.pinterest.com/brand-guidelines/ |
| Yelp | permits, **conditionally** | yelp.com/brand |
| Zillow | requires permission (text links only) | zillow.com/c/info/zillow-trademark-guidelines/ |
| Airbnb | requires permission | airbnb.com/help/article/3233 |
| Booking.com | requires permission | partner contract, cl. 9.8 |
| Indeed | requires permission | indeed.com/legal/trademark-guidelines |
| Glassdoor | silent (and now an Indeed mark) | glassdoor.com/about/press/media-assets/ |
| Crunchbase | silent | about.crunchbase.com/press/ |
| eBay | requires permission | brandpermission.ebay.com/guidelines |
| Etsy | requires permission | etsy.com/legal/trademarks/ |
| Best Buy | requires permission | partners.bestbuy.com logo authorization form |
| Walmart | requires permission | brandcenter.walmart.com/brand/trademarks |
| Target | requires permission | Licensed Materials Agreement |
| Zara (Inditex) | requires permission | inditex.com/itxcomweb/bs/en/info/legal |
| Shopee | requires permission | Shopee Terms of Service |
| Quora | requires permission | help.quora.com Platform Policies |

**Twenty of twenty-five require prior written permission on the face of their own
published text.** That alone settles most of the table.

### Why even the permissive ones were not shipped

Three brands — Instagram, Threads, Yelp — publish text that permits this kind of
use without asking. None of them was shipped either, and the reason is the same
for all three and easy to miss: **the permission is a licence to use the owner's
asset, not a licence to draw the shape.**

Instagram and Threads: *"Anyone using Instagram's assets should only use the
logos and screenshots found on our Brand Resource Center site and follow these
guidelines."* Yelp: *"Yelp grants you a … limited license to use the Yelp
Creative Assets to refer to Yelp or its services … only in accordance with these
Brand Guidelines."*

This repository ships path data copied from simple-icons, not asset files
obtained from Meta's Brand Resource Center or Yelp's. simple-icons' glyphs are
also monochrome single-path redrawings — Instagram's actual mark is a
multi-colour glyph — so shipping one would breach the source condition *and* the
no-modification rule at once. YouTube's grant is scoped to YouTube API clients
and Assay is not one; Google's excludes *"marketing materials for a business"*,
which a commercial product's card grid is.

So the count that matters is not 20 of 25 but **25 of 25**: no brand in this
table publishes text that covers redrawn third-party path data on a card in a
commercial product.

### Caveats on the reading, since they bear on how much it carries

- **TikTok's own domains were unreachable** from the network this was read on.
  The text quoted is from `tiktokbrandhub.com`, TikTok's own brand site, not
  `tiktok.com/legal`. The verdict would not change either way — it is
  "requires permission" — but the source is second-best.
- **Glassdoor's guidelines exist only inside a downloadable ZIP**, which was not
  opened. "Silent" here means the public page carries no permission language,
  not that Glassdoor has published none. Its footer now assigns the mark to
  Indeed, whose policy is explicit and restrictive.
- **Booking.com and Target** are quoted from a partner contract and a GiftCard
  licence respectively. Neither is a public-facing brand policy; no such page
  was found for either.
- **Crunchbase** offers logo downloads with no usage text anywhere on any
  Crunchbase-owned domain. Absence of a policy is not a grant.

If any of these is settled differently later, adding the brand to `MARKS` in
`web/components/brand-mark.tsx` retires its letter with no other change.

## If you own one of these marks

Open an issue and the mark will be removed on request, without argument.

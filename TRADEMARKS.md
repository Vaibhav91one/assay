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
on. **None of them shows its owner's mark**, and that is a decision rather than
an oversight.

Applying the standard above to twenty-eight more brands means reading and
quoting twenty-eight more published policies. The seven that were read say the
answer is usually no: Amazon requires prior written approval *and* a mark
appearing by itself, arXiv permits its logo for exactly one purpose this
application is not, the PSF attaches a condition a 38px glyph cannot carry.
Shipping twenty-eight marks on the assumption that the remainder would say yes
would be a confident claim about other people's rights, made because checking
was inconvenient.

So each of those cards carries **Assay's own artwork**: the brand's initial
letter in a tinted tile. It reproduces no logo, borrows no trade dress, and the
tint is derived from a hash of the card's id rather than from the brand's own
colour, so no card approximates the palette its owner uses. Where a mark has
already been cleared and the brand is the same — GitHub, Wikipedia — the
cleared mark is used, because it is the same permission.

If a policy is read and quoted here, adding that brand to `MARKS` in
`web/components/brand-mark.tsx` retires its letter with no other change.

## If you own one of these marks

Open an issue and the mark will be removed on request, without argument.

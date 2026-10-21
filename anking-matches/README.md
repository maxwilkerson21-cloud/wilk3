# AnKing → SFM / MSK matching

Matched **6,607 of 28,648** AnKing notes (8,596 cards) to your SFM and MSK course cards. Every other AnKing card is left suspended.

**Sources used:** SFM = `year 1` > SFM (In-House) Complete + SFM:); MSK = OMS-I MSK, MSK (Raja) and MWMSK. Other `year 1` units (BioEnergetics, Lipid, etc.) and "wrong questions" were not used, since you said SFM and MSK are your only finished units.

**Confidence tiers**
- **Direct** (2,781 notes): strong overlap of specific terms with a course card (same fact, reworded). Roughly 2 in 3 or better are on-point on spot checks.
- **Probable** (3,826 notes): same topic area but looser. About half are on-point. These sit in a `::Probable` subdeck under each group so you can suspend that subdeck in one click if it's too much.

| Subject | Group | Direct | Probable |
|---|---|---|---|
| MSK | ECOS (clinical skills) | 198 | 273 |
| MSK | Exam 1 | 450 | 546 |
| MSK | Exam 2 | 385 | 544 |
| MSK | Exam 3 | 455 | 582 |
| SFM | Exam 1 | 496 | 684 |
| SFM | Week 1 | 303 | 482 |
| SFM | Week 2 | 356 | 422 |
| SFM | Week 3 | 138 | 293 |

## Files
- `AnKing_Step_Deck_SFM_MSK_matched.apkg` – edited AnKing deck (no media): matched cards unsuspended and filed in `AnKing Step Deck::SFM|MSK::<Exam/Week>[::Probable]`, the rest suspended. Notes keep their IDs.
- `anking_matches.csv` – every match: AnKing text, the course card it matched, shared key terms, score, confidence.
- `wilk_anking_apply.ankiaddon` – one-click helper (see below).

## Using it on your real collection
Anki does **not** change suspension or decks of cards you already have when you import (tested). Importing only adds tags (`Wilk::Match::SFM|MSK`, `Wilk::Tier::*`, `Wilk::Exam::*`, `Wilk::Topic::*`) to the matched notes. So:
1. File > Import the .apkg.
2. Install `wilk_anking_apply.ankiaddon` (double-click, restart Anki), then Tools > "Apply AnKing SFM/MSK matches". It unsuspends the tagged cards and moves them into the subdecks.
   - No add-on? In the browser search `tag:Wilk::Match::MSK tag:Wilk::Tier::Direct is:suspended`, select all, Cards > Toggle Suspend, then Change Deck.
3. Your course decks and your other unit's cards are never touched.

## Caveats
- Matching is keyword-overlap, not true semantic search (no model could be downloaded here), so wording-different facts and image-only cards can be missed, and Probable has false positives. Scan the CSV by exam/topic if you want to prune.
- ECOS / clinical-skills content (OMM, interview, physical exam) has few AnKing equivalents; its matches are the weakest.
- Heavily cloze-based AnKing cards without media are kept as-is; image-occlusion AnKing cards weren't matched.

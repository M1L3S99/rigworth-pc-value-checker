# RigWorth PC Value Checker

RigWorth turns a pasted PC specification into matched components and an estimated UK used value.

## Features

- Extracts separate typed component entities before catalogue matching
- Safely matches informal descriptions against 410 dated component price records
- Shows individual price ranges, inferred allowances, source phrases, and capacity arithmetic
- Estimates P25/P50/P75 whole-PC values from sold comparables or a 12,000-sample fallback
- Lets users correct uncertain matches with alternative dropdowns
- Flags missing, ambiguous, conflicting, and unknown-risk components

Prices are rough UK used-market references based on sold/completed listing research. They are estimates rather than guaranteed sale prices.

## Run locally

```sh
npm start
```

Then open `http://127.0.0.1:4173/`.

## Validate

```sh
npm run check
```

# Spotter ZIP reference points

This seed uses the U.S. Census Bureau's 2025 National ZIP Code Tabulation Area Gazetteer. The release covers the 50 states, the District of Columbia, and Puerto Rico. Its coordinates are representative points of census areas. Use them for approximate radius results.

- [2025 Gazetteer and coverage](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html)
- [Official Census ZIP archive](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip)
- [2025 Gazetteer field definitions](https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts/gaz25-record-layouts.html)
- [Census limitations and USPS ZIP coverage](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html)

The seed contains 33,791 rows. Parse the national pipe-delimited text, keep `GEOID`, `INTPTLAT`, and `INTPTLONG`, validate unique five-digit identifiers and finite coordinates in geographic bounds, sort by the five-character identifier, and encode only those fields in SQL. Coordinates retain their source precision. The target table must already exist with a unique `zip` text key. Reruns update matching rows. Review removals explicitly if replacing this release with a newer Gazetteer.

- Archive SHA-256 `51516a4283bab5cd2376eec75609ddc4b363a18297e8adeeaac7b03cf7c84dbe`
- Seed SHA-256 `95640d8d26fa1cc921944a5d0882d3f82cb91f0daf49387fdb553568d29494f2`

## ZIP input

Treat ZIP codes as strings and retain leading zeros. Trim surrounding whitespace at the input boundary and accept exactly five ASCII digits. Reject ZIP+4, all-zero input, Unicode digits, signs, and embedded whitespace. A well-formed code can lack a Census point, so a lookup miss is distinct from a malformed code. Same-ZIP filtering can use exact string equality after input validation. If a radius search lacks the origin point, ask for another ZIP or let the member choose Same ZIP. Exclude candidates that have no point from radius results. Keep member ZIPs and point data out of public profile responses.

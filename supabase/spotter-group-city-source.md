# Spotter Groups city reference

The migration contains 32,350 cities and Census designated places from the U.S. Census Bureau's 2025 national Places Gazetteer. City IDs use its seven-digit place GEOID. Each ID includes the FIPS state code so cities with the same name stay separate. Display names omit the Census legal or statistical suffix where it has a standard trailing form.

The 2020 ZCTA-to-Place relationship file supplies the default city for 28,776 ZIP Code Tabulation Areas that also exist in the current Spotter ZIP centroid catalog. Pick the 2025 place with the largest positive land overlap for each ZCTA. For a ZCTA with no land, use its water overlap. Break ties by the lowest place GEOID. This mapping suggests a city near the member's training ZIP. It can differ from the ZIP's mailing city where an area crosses city boundaries. Members can choose a city directly. The search returns a city name, region and country without returning member ZIPs.

The data covers the 50 states, the District of Columbia and Puerto Rico. A well-formed training ZIP with no mapped place has no city suggestion. Older app versions retain their ZIP boards in this case.

- [2025 Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html)
- [2025 national Places Gazetteer archive](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip)
- [2020 Census relationship files](https://www.census.gov/geographies/reference-files/2020/geo/relationship-files.html)
- [National ZCTA-to-Place relationship data](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt)

The Places Gazetteer ZIP archive has SHA-256 `49644173a453469d9bd77fb7a493b027f87567e209edaf2078aac7543ac2ee29`. The ZCTA-to-Place file has SHA-256 `698a5dad71ed419411677d0ffd8ecd9331067f59c472cdd239b92c12f698285d`.

import Foundation

// Smart search (3.0 deck: SEARCH) — synonym expansion + typo-tolerant fuzzy match.
// Client-side: no synonym endpoint exists, so the table + Levenshtein live here.
enum SmartSearch {
    // Common RU/mixed synonyms → canonical catalog terms.
    private static let synonyms: [String: [String]] = [
        "телефон": ["смартфон", "iphone", "phone"],
        "смартфон": ["телефон", "iphone"],
        "ноут": ["ноутбук", "laptop", "macbook"],
        "ноутбук": ["laptop", "macbook"],
        "наушники": ["аудио", "airpods", "headphones"],
        "аудио": ["наушники", "airpods"],
        "часы": ["watch", "смарт-часы"],
        "планшет": ["ipad", "tablet"],
        "зарядка": ["адаптер", "charger", "кабель"]
    ]

    /// True if `query` matches any field via substring, synonym, or a small typo distance.
    static func matches(_ query: String, fields: [String]) -> Bool {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else { return true }

        let haystack = fields.map { $0.lowercased() }
        let terms = [normalizedQuery] + expandedSynonyms(for: normalizedQuery)

        for term in terms {
            for field in haystack where field.contains(term) {
                return true
            }
        }
        // Typo tolerance: compare the query against each whitespace token of every field.
        for field in haystack {
            for token in field.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "·" })
                where levenshtein(normalizedQuery, String(token)) <= typoTolerance(for: normalizedQuery) {
                return true
            }
        }
        return false
    }

    private static func expandedSynonyms(for query: String) -> [String] {
        synonyms
            .filter { key, _ in query.contains(key) }
            .flatMap { $0.value }
    }

    private static func typoTolerance(for query: String) -> Int {
        query.count <= 4 ? 1 : 2
    }

    /// Classic Levenshtein edit distance (small strings — catalog tokens).
    static func levenshtein(_ lhs: String, _ rhs: String) -> Int {
        if lhs == rhs { return 0 }
        if lhs.isEmpty { return rhs.count }
        if rhs.isEmpty { return lhs.count }

        let leftCharacters = Array(lhs)
        let rightCharacters = Array(rhs)
        var previous = Array(0...rightCharacters.count)
        var current = [Int](repeating: 0, count: rightCharacters.count + 1)

        for leftIndex in 1...leftCharacters.count {
            current[0] = leftIndex
            for rightIndex in 1...rightCharacters.count {
                let cost = leftCharacters[leftIndex - 1] == rightCharacters[rightIndex - 1] ? 0 : 1
                current[rightIndex] = min(
                    previous[rightIndex] + 1,        // deletion
                    current[rightIndex - 1] + 1,     // insertion
                    previous[rightIndex - 1] + cost  // substitution
                )
            }
            swap(&previous, &current)
        }
        return previous[rightCharacters.count]
    }
}

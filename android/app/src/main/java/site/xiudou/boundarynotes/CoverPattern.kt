package site.xiudou.boundarynotes

/** Port of the website generated-cover.tsx; same category motifs and slug colors. */
fun coverHash(seed:String):UInt {
    var hash=2166136261u
    seed.codePoints().forEach{hash=(hash xor it.toUInt())*16777619u}
    hash=hash xor (hash shr 15);hash*=2246822507u;return hash xor (hash shr 13)
}

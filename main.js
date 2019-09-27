
let request = require('request-promise')
let cheerio = require('cheerio')
let LDFServer = require('ldf-facade')
let { BOUND, UNBOUND, TOOBIG, UNIMPLEMENTED } = require('ldf-facade')
let extend = require('xtend')



let distrowatchPrefix = 'http://distrowatch.com/'


let server = new LDFServer()

server.enumSubjects(async (state) => {

    console.log('enumSubjects')

    let distros = await distrowatchSearch({})

    return {
        values: distros.map((distro) => distro.href),
        total: distros.length,
        nextState: null
    }
})

server.pattern('s??', async (state, pattern) => {

    console.log('s??')
    console.dir(pattern)

    let subject = pattern.s

    if(subject.indexOf(distrowatchPrefix) !== 0) {
        // does not start with the correct prefix
        return UNIMPLEMENTED
    }

    let details = await distrowatchDetails(subject)

    let triples = []

    for(let detail in details) {
        for(let value of details[detail]) {
            triples.push({ s: subject, p: distrowatchPrefix + detail, o: value, datatype: 'string' })
        }
    }

    return {
        triples: triples,
        total: 1,
        nextState: null
    }

})

server.pattern('?po', async (state, pattern) => {

    if(pattern.p.indexOf(distrowatchPrefix) === 0) {
        let criteria = pattern.p.slice(distrowatchPrefix.length)
        let results = await distrowatchSearch({ [criteria]: pattern.o })
        return {
            triples: results.map((result) => extend(pattern, { s: result.href })),
            total: results.length,
            nextState: null
        }
    }

    return UNIMPLEMENTED

})

server.listen(7770)

async function distrowatchSearch(query) {

    query = extend({
        ostype: 'All',
        category: 'All',
        origin: 'All',
        basedon: 'All',
        notbasedon: 'None',
        desktop: 'All',
        architecture: 'All',
        package: 'All',
        rolling: 'All',
        isosize: 'All',
        netinstall: 'All',
        language: 'All',
        defaultinit: 'All',
        status: 'Active'
    }, query)

    let $ = cheerio.load(await request({
        method: 'post',
        url: 'http://distrowatch.com/search.php',
        qs: query
    }))

    let results = []
    let re = /[0-9]+\.\s+(.*)\s+\([0-9]+\)/

    $('b').each((i, el) => {
        let matches = re.exec($(el).text())
        if(matches) {
            results.push({
                name: matches[1],
                href: distrowatchPrefix + $(el).find('a').attr('href')
            })
        }
    })

    return results
}

async function distrowatchDetails(href) {

    let $ = cheerio.load(await request({
        method: 'get',
        url: href
    }))

    function prop(label) {
        let el = $($('b').filter((i, el) => $(el).text() === label)[0])
        let siblings = el.siblings(':not(b)').toArray()
        return siblings.map((s) => $(s).text()).filter((s) => s)
    }

    function feature(label) {
        let el = $($('th').filter((i, el) => $(el).text() === label)[0])
        let siblings = el.next('td').text()
        return siblings.split(', ')
    }

    return {
        ostype: prop('OS Type:'),
        category: prop('Category:'),
        origin: prop('Origin:'),
        basedon: prop('Based on:'),
        desktop: prop('Desktop:'),
        architecture: prop('Architecture:'),
        package: feature('Package Management'),
        rolling: feature('Release Model'),
        isosize: feature('Image Size (MB)'),
        netinstall: 'All',
        language: feature('Multilingual'),
        defaultinit: feature('Init Software'),
        status: prop('Status:')
    }

}



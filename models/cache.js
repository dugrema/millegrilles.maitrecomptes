// Cache memoire
const TTL_APPLICATIONS = 30_000

let _applications = null,
    _applicationsTimeout = null

function setCacheApplications(applications) {
    // Clear applications
    if(_applicationsTimeout) {
        clearTimeout(_applicationsTimeout)
    }
    _applicationsTimeout = setTimeout(()=>{
        console.debug("Clear cache liste applications")
        _applications = null
        _applicationsTimeout = null
    }, TTL_APPLICATIONS)
    _applications = applications
}

function getCacheApplications() {
    return _applications
}

module.exports = { setCacheApplications, getCacheApplications }

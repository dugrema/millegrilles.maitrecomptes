const debug = require('debug')('mqdao')
const { MESSAGE_KINDS } = require('@dugrema/millegrilles.utiljs/src/constantes')

const L2Prive = '2.prive'

const DOMAINE_INSTANCE = 'instance',
      DOMAINE_MONITOR = DOMAINE_INSTANCE,
      CONST_DOMAINE_GROSFICHIERS = 'GrosFichiers',
      CONST_DOMAINE_MAITREDESCLES = 'MaitreDesCles',
      CONST_DOMAINE_FICHIERS = 'fichiers',
      CONST_DOMAINE_TOPOLOGIE = 'CoreTopologie',
      CONST_DOMAINE_CATALOGUES = 'CoreCatalogues',
      CONST_DOMAINE_COREPKI = 'CorePki',
      CONST_DOMAINE_MAITREDESCOMPTES = 'CoreMaitreDesComptes',
      CONST_DOMAINE_MESSAGERIE = 'Messagerie'


function getChallengeDelegation(socket, params) {
    debug("getChallengeDelegation params ", params)
    const session = socket.handshake.session,
          hostname = socket.handshake.headers.host,
          userId = session.userId
    const commande = {userId, hostname, delegation: true}
    debug("getChallengeDelegation commande ", commande)
    return transmettreCommande(socket, commande, 'genererChallenge', {domaine: CONST_DOMAINE_MAITREDESCOMPTES})
}

// Fonctions generiques

async function transmettreRequete(socket, params, action, opts) {
    opts = opts || {}
    const domaine = opts.domaine || DOMAINE_MONITOR
    const exchange = opts.exchange || L2Prive
    const partition = opts.partition
    try {
        verifierMessage(params, domaine, action)
        const reponse = await socket.amqpdao.transmettreRequete(
            domaine, 
            params, 
            {action, partition, exchange, noformat: true, decoder: true}
        )
        return reponse
    } catch(err) {
        console.error("mqdao.transmettreRequete ERROR : %O", err)
        return {ok: false, err: ''+err}
    }
}

async function transmettreCommande(socket, params, action, opts) {
    opts = opts || {}
    const noformat = opts.noformat || false
    const domaine = opts.domaine || CONST_DOMAINE_MAITREDESCOMPTES
    const exchange = opts.exchange || L2Prive
    const nowait = opts.nowait
    const routage = (params?params.routage:{}) || {}
    const partition = opts.partition || routage.partition
    try {
        if(noformat === true) {
            verifierMessage(params, domaine, action)
        }
        return await socket.amqpdao.transmettreCommande(
            domaine, 
            params, 
            {action, partition, exchange, noformat, decoder: true, nowait}
        )
    } catch(err) {
        console.error("mqdao.transmettreCommande ERROR : %O", err)
        return {ok: false, err: ''+err}
    }
}

/* Fonction de verification pour eviter abus de l'API */
function verifierMessage(message, domaine, action) {
    const routage = message.routage || {},
          domaineRecu = routage.domaine,
          actionRecue = routage.action
    if(domaineRecu !== domaine) throw new Error(`Mismatch domaine (${domaineRecu} !== ${domaine})"`)
    if(actionRecue !== action) throw new Error(`Mismatch action (${actionRecue} !== ${action})"`)
}

module.exports = {
    getChallengeDelegation,
}

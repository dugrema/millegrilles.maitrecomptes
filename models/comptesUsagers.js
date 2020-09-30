const debug = require('debug')('millegrilles:maitrecomptes:comptesUsagers')

class ComptesUsagers {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.idmg = amqDao.pki.idmg
    this.proprietairePresent = false
  }

  infoMillegrille = async () => {
    // Verifie si la MilleGrille est initialisee. Conserve le IDMG
    if( ! this.proprietairePresent ) {
      // Faire une requete pour recuperer l'information
      const domaineAction = 'MaitreDesComptes.infoProprietaire'
      const requete = {}
      debug("Requete info proprietaire")
      const compteProprietaire = await this.amqDao.transmettreRequete(
        domaineAction, requete, {decoder: true})

      debug("Reponse compte proprietaire")
      debug(compteProprietaire)

      if(compteProprietaire.cles) {
        this.proprietairePresent = true
      }
    }

    return {
      idmg: this.idmg,
      proprietairePresent: this.proprietairePresent
    }
  }

  infoCompteProprietaire = async () => {

    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await this.amqDao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if( compteProprietaire.u2f ) {
      debug("Requete info proprietaire, recu : %s", compteProprietaire)
      return compteProprietaire
    } else {
      debug("Requete compte usager, compte proprietaire inexistant")
      return false
    }

  }

  chargerCompte = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.chargerUsager'
    const requete = {nomUsager}
    debug("Requete compte usager %s", nomUsager)
    const compteUsager = await this.amqDao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    if(compteUsager.nomUsager) {
      debug("Requete compte usager, recu %s : %s", nomUsager, compteUsager)
      return compteUsager
    } else {
      debug("Requete compte usager, compte %s inexistant", nomUsager)
      return false
    }

  }

  prendrePossession = async(compte) => {
    const domaineAction = 'MaitreDesComptes.inscrireProprietaire'
    const transaction = {...compte}
    debug("Transaction inscrire proprietaire")
    debug(transaction)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Inscription proprietaire completee")
  }

  inscrireCompte = async (nomUsager, compte) => {
    const domaineAction = 'MaitreDesComptes.inscrireUsager'
    const transaction = {nomUsager, ...compte}
    debug("Transaction inscrire compte usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Inscription compte usager %s completee", nomUsager)
  }

  changerMotdepasseProprietaire = async (nomUsager, motdepasse) => {
    const domaineAction = 'MaitreDesComptes.majMotdepasse'
    const transaction = {nomUsager, motdepasse, est_proprietaire: true}
    debug("Transaction changer mot de passe du proprietaire")
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction changer mot de passe de %s completee", nomUsager)
  }

  changerCleComptePrive = async (nomUsager, nouvelleCle) => {
    const domaineAction = 'MaitreDesComptes.majCleUsagerPrive'
    const transaction = {nomUsager, cle: nouvelleCle}
    debug("Transaction changer mot de passe de %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction changer mot de passe de %s completee", nomUsager)
  }

  supprimerMotdepasse = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.suppressionMotdepasse'
    const transaction = {nomUsager}
    debug("Transaction supprimer mot de passe de %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer mot de passe de %s completee", nomUsager)
  }

  ajouterCle = async (nomUsager, cle, resetCles) => {
    const domaineAction = 'MaitreDesComptes.ajouterCle'
    const transaction = {nomUsager, cle}
    if(resetCles) {
      transaction['reset_cles'] = true
    }
    debug("Transaction ajouter cle U2F pour %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter cle U2F pour %s completee", nomUsager)
  }

  ajouterCleProprietaire = async (cle, resetCles) => {
    const domaineAction = 'MaitreDesComptes.ajouterCle'
    const transaction = {
      cle,
      est_proprietaire: true,
    }
    if(resetCles) {
      transaction['reset_cles'] = true
    }
    debug("Transaction ajouter cle U2F pour proprietaire")
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter cle U2F pour proprietaire completee")
  }

  associerIdmg = async (nomUsager, idmg, opts) => {
    if(!opts) opts = {}

    const domaineAction = 'MaitreDesComptes.associerCertificat'
    const transaction = {nomUsager, idmg}
    if(opts.resetCles) {
      transaction['reset_idmg'] = true
    }
    if(opts.cle) {
      transaction['cle'] = opts.cle
    }
    if(opts.chaineCertificats) {
      transaction['chaine_certificats'] = opts.chaineCertificats
    }
    debug("Transaction associer idmg %s pour %s", idmg, nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction associer idmg %s pour %s completee", idmg, nomUsager)
  }

  supprimerCles = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.supprimerCles'
    const transaction = {nomUsager}
    debug("Transaction supprimer cles U2F %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer cles U2F de %s completee", nomUsager)
  }

  supprimerUsager = async (nomUsager) => {
    const domaineAction = 'MaitreDesComptes.supprimerUsager'
    const transaction = {nomUsager}
    debug("Transaction supprimer usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction supprimer usager %s completee", nomUsager)
  }

  ajouterCertificatNavigateur = async (nomUsager, params) => {
    const domaineAction = 'MaitreDesComptes.ajouterNavigateur'
    const transaction = {nomUsager, ...params}
    debug("Transaction ajouter certificat navigateur compte usager %s", nomUsager)
    await this.amqDao.transmettreTransactionFormattee(transaction, domaineAction)
    debug("Transaction ajouter certificat navigateur compte usager %s completee", nomUsager)
  }

  requeteCleProprietaireTotp = async _ => {
    const requeteCleSecrete = {
      // 'certificat': self.certificat_courant_pem,
      'domaine': 'MaitreDesComptes',
      'identificateurs_document': {
        'libelle': 'proprietaire',
        'champ': "totp"
      }
    }

    const domaineAction = 'MaitreDesCles.decryptageDocument'

    const secretTotp = await this.amqDao.transmettreRequete(
      domaineAction, requeteCleSecrete, {decoder: true, attacherCertificat: true})
    debug("Secret TOTP recu : %O", secretTotp)

    if(secretTotp.acces === '0.refuse') {throw new Error("Acces secret TOTP refuse")}

    // Dechiffrer cle secrete

  }

  relayerTransaction = async (transaction) => {
    debug("relayerTransaction : %O", transaction)
    const confirmation = await this.amqDao.transmettreEnveloppeTransaction(transaction)
    debug("Confirmation relayer transactions : %O", confirmation)
    return confirmation
  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init(amqDao) {
  const comptesUsagers = new ComptesUsagers(amqDao)

  const injecterComptesUsagers = async (req, res, next) => {
    debug("Injection req.comptesUsagers")
    req.comptesUsagers = comptesUsagers  // Injecte db de comptes
    next()
  }

  const extraireUsager = async (req, res, next) => {

    const nomUsager = req.nomUsager  // Doit avoir ete lu par sessions.js
    const estProprietaire = req.sessionUsager?req.sessionUsager.estProprietaire:false
    if(estProprietaire) {
      debug("Chargement compte proprietaire")
      const compte = await comptesUsagers.infoCompteProprietaire()
      if(compte) {
        req.compteUsager = compte
      }

    } else if(nomUsager) {
      debug('Nom usager %s', nomUsager)

      // Extraire compte usager s'il existe
      const compte = await comptesUsagers.chargerCompte(nomUsager)
      if(compte) {
        req.compteUsager = compte
      }
    }

    next()
  }

  return {injecterComptesUsagers, extraireUsager}
}

module.exports = {init}

const debug = require('debug')('millegrilles:maitrecomptes:mqEventsHandler')

var _amqpdao,
    _socketIo

function init(amqpdao, socketIo) {
  debug("Init mq events handler")
  _amqpdao = amqpdao
  _socketIo = socketIo
}

function enregistrerCallbacks() {
  debug("Enregistrer callbacks listeners events MQ")
  const routingKeyManager = _amqpdao.routingKeyManager
  const rkActiverFingerprint = ['evenement.CoreMaitreDesComptes.activationFingerprintPk']
  routingKeyManager.addRoutingKeyCallback(activationFingerprintPk, rkActiverFingerprint, {})
}

function activationFingerprintPk(routingKey, message) {
  const fingerprintPk = message.fingerprint_pk
  debug("Emettre confirmation d'activation de certificat pour fingerprint pk=%s", fingerprintPk)
  _socketIo.to('fingerprintPk/' + fingerprintPk).emit('fingerprintPk', {fingerprintPk, ok: true})
}

module.exports = {init, enregistrerCallbacks}

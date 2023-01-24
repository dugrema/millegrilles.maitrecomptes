import Applications from './Applications'

import {useEtatPret} from './WorkerContext'

function Accueil(props) {

    const { setSectionAfficher, compteUsagerServeur, erreurCb } = props

    const etatPret = useEtatPret()

    if(!etatPret) return 'Accueil - Chargement en cours'

    return (
        <Applications 
            setSectionAfficher={setSectionAfficher} 
            compteUsagerServeur={compteUsagerServeur}
            erreurCb={erreurCb} 
          />
    )
}

export default Accueil

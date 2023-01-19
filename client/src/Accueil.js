import Applications from './Applications'

import {useEtatPret} from './WorkerContext'

function Accueil(props) {

    const { 
        setSectionAfficher,
        etatUsagerBackend, setEtatUsagerBackend,
        resultatAuthentificationUsager,
        erreurCb, 
    } = props

    const etatPret = useEtatPret()

    if(!etatPret) return 'Accueil - Chargement en cours'

    return (
        <Applications 
            setSectionAfficher={setSectionAfficher} 
            etatUsagerBackend={etatUsagerBackend}
            setEtatUsagerBackend={setEtatUsagerBackend}
            resultatAuthentificationUsager={resultatAuthentificationUsager}
            erreurCb={erreurCb} 
          />
    )
}

export default Accueil

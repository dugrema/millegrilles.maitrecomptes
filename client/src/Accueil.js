import Applications from './Applications'

function Accueil(props) {
    const { 
        workers, etatAuthentifie, infoUsagerBackend, usagerDbLocal, usagerExtensions, setUsagerDbLocal, 
        resultatAuthentificationUsager, setSectionAfficher,
        erreurCb, 
    } = props

    if(!infoUsagerBackend) return 'Chargement en cours'

    return (
        <Applications 
            workers={workers} 
            etatAuthentifie={etatAuthentifie}
            usagerDbLocal={usagerDbLocal}
            infoUsagerBackend={infoUsagerBackend}
            usagerExtensions={usagerExtensions} 
            resultatAuthentificationUsager={resultatAuthentificationUsager}
            setSectionAfficher={setSectionAfficher} 
            setUsagerDbLocal={setUsagerDbLocal}
            erreurCb={erreurCb} 
          />
    )
}

export default Accueil

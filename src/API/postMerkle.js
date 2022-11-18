const { pinJSONToIPFS } = require("./pinJSONtoIPFS.js")
const { merkletree} = require("./merkleTree.js")

require('dotenv').config()

const postMerkle = async (
    voters,
    candidates,
) => {
 
    const votersJSON = merkletree(
       voters
    )

    const candidatesJSON = merkletree(
        candidates
     )

    const votersJsonURI = await pinJSONToIPFS(
        process.env.PINATAAPIKEY,
        process.env.PINATASECRETAPIKEY,
        votersJSON
    )
    const candidatesJsonURI = await pinJSONToIPFS(
        process.env.PINATAAPIKEY,
        process.env.PINATASECRETAPIKEY,
        candidatesJSON
    )
    return (votersJsonURI,candidatesJsonURI)
}

module.exports = { postMerkle }
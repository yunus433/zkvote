const { pinJSONToIPFS } = require("./pinJSONtoIPFS.js")
const { metadata }  = require("./metadata.js")
const { merkletree} = require("./merkleTree.js")

require('dotenv').config()

const postMerkle = async (
    voters,
    candidates,
) => {
 
    // Import hash into proper section in metadata
    // Prepare metadata for Pinata
    const votersJSON = merkletree(
       voters
    )

    const candidatesJSON = merkletree(
        candidates
     )

    // Upload json to ifps 
    // Get json hash
    const metadataURI = await pinJSONToIPFS(
        process.env.PINATAAPIKEY,
        process.env.PINATASECRETAPIKEY,
        tokenMetadata
    )
    return metadataURI
}

module.exports = { postMerkle }
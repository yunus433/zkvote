import {
    Field
  } from 'snarkyjs'
  
const { pinJSONToIPFS } = require("./pinJSONtoIPFS.js")
const { merkletree} = require("./merkleTree.js")

require('dotenv').config()

const postMerkle = async (
    leaves: Field[],
    root: Field
) => {
 
    const treeJSON = merkletree(
       leaves,
       root
    )

    const treeJsonURI = await pinJSONToIPFS(
        process.env.PINATAAPIKEY,
        process.env.PINATASECRETAPIKEY,
        treeJSON
    )
    return treeJsonURI
}

module.exports = { postMerkle }
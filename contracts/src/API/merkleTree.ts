import {
    Field
  } from 'snarkyjs';

const merkletree = (
    leaves: Field[],
    root: Field
) => {
    const leavesJSON = JSON.stringify(leaves);
    
    const treeJson = 
    {
        merkleRoot: root,
        treeLeaves: leaves
    }

    return treeJson
}

module.exports = { merkletree }
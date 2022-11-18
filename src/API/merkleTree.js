const merkletree = (
    leaves,
    root
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
export const equipmentPrice = level => 80 + level * 60;
export const canUpgradeEquipment = (bank, level) => level < 10 && bank >= equipmentPrice(level);
export const affordableEquipmentCount = (bank, gear) => gear.filter(level => canUpgradeEquipment(bank, level)).length;

/**
 * @typedef {typeof import('../module.mjs').CORE} CORE
 */

import { Enum } from '../library/lib.mjs'

class Beastheart {

  static build() {
    Hooks.once('mcdm-core.register', Beastheart.#register);
    Hooks.once('mcdm-core.addApi', Beastheart.#addApi);
  }

  /**
   * @readonly
   * @type Record<string, any>
   */
  static #BH = new Enum( {
    LINK_FLAG: 'ferolink',
    RES_SETTING: 'feroPath',
    RES_OVERRIDE_SETTING: 'feroPathOverride',
    BH_CLASS: 'beastheart',
    MC_CLASS: 'moncom',
  }, 'BH')

  static #settings() {
    const Util = game.modules.get('mcdm-core')?.api.Util;
    if(!Util) console.error(Util.localize('common.plugin.noApi'));

    const settingsData = {
      'feroPath' : {
        scope: 'world',
        config: true,
        type: String,
        choices: {
          'system.resources.primary.value': game.i18n.localize('DND5E.ResourcePrimary') + " " + game.i18n.localize('CARD.Value'),

          'system.resources.primary.max': game.i18n.localize('DND5E.ResourcePrimary') + " " + game.i18n.localize('Maximum'),

          'system.resources.secondary.value': game.i18n.localize('DND5E.ResourceSecondary') + " " + game.i18n.localize('CARD.Value'),

          'system.resources.secondary.max': game.i18n.localize('DND5E.ResourceSecondary') + " " + game.i18n.localize('Maximum'),

          'system.resources.tertiary.value': game.i18n.localize('DND5E.ResourceTertiary') + " " + game.i18n.localize('CARD.Value'),

          'system.resources.tertiary.max': game.i18n.localize('DND5E.ResourceTertiary') + " " + game.i18n.localize('Maximum'),

        },
        default: 'system.resources.primary.value'
      },
    }

    Util.applySettings(settingsData);
  }

  /**
   * Lookup function for retrieving the current world setting indicating
   * the resource field to be used to track Ferocity
   *
   * @returns {string}
   */
  static getFerocityPath() {
    const Util = game.modules.get('mcdm-core')?.api.Util;
    const world = Util.setting(Beastheart.#BH.RES_SETTING);
    return world;
  }

  /**
   * Helper for retrieving the actor bonded to the provided actor. Will return
   * either a Beastheart or Monstrous Companion Actor.
   *
   * @param {Actor} actor Retrives the bonded actor (caregiver or companion) from
   *  the provided actor
   *
   * @returns {Actor|undefined} bonded actor, or undefined if none
   */
  static getBondedActor(actor) {
    
    //get the bonded actor ID
    const bondId = actor?.getFlag('mcdm-core', Beastheart.#BH.LINK_FLAG)

    if(!bondId){
      console.debug(`Actor "${actor.name}" is not bonded to a Caregiver or Companion.`);
      return;
    }

    return game.actors.get(bondId);
  }

  /**
   * @param {Actor} actor Actor under test
   * @param {string} identifier class name identifier to search for
   *
   * @returns {Item|undefined} class item matching identifier provided
   */
  static #getClass(actor, identifier, owned = false) {
    if(owned && !actor.isOwner) return;
    return actor.items.find(item => item.system.identifier == identifier)
  }

  /**
   * Helper method for checking if a given actor is a Linked Caregiver
   *
   * @param {Actor} actor Actor under test
   * @param {boolean} [owned=true] Consider only owned actors
   */
  static isCaregiver(actor, owned = true) {
    if (owned && !actor.isOwner) return false;
    const bondId = actor?.getFlag('mcdm-core', Beastheart.#BH.LINK_FLAG)
    return !!bondId;
  }

  /**
   * Helper method for checking if a given actor is a Beastheart 
   *
   * @param {Actor} actor Actor under test
   * @param {boolean} [owned=true] Consider only owned actors
   */
  static isBeastHeart(actor, owned = true) {
    return !!(Beastheart.#getClass(actor, Beastheart.#BH.BH_CLASS, owned))
  }

  /**
   * Helper method for checking if a given actor is a Monstrous Companion
   *
   * @param {Actor} actor Actor under test
   * @param {boolean} [owned=true] Consider only owned actors
   */
  static isCompanion(actor, owned = true) {
    return !!(Beastheart.#getClass(actor, Beastheart.#BH.MC_CLASS, owned))
  }

  /**
   * Hook handler for mcdm-core plugin registration
   *
   * @param {CORE["registerPlugin"]} registrar
   * @param {Object<string, string|number>} versionInfo
   */
  static #register(registrar, versionInfo) {
    console.log(`Registering Beastheart Plugin`, versionInfo);
    registrar('updateActor', Beastheart.#ferocityLink, false);
  }

  /**
   * Hook handler for mcdm-core api registration
   * and any other setup tasks that require
   * the mcdm-core API
   *
   * @param {CORE["addPluginApi"]} helper
   */
  static #addApi(helper) {
    Beastheart.#settings();
    helper(Beastheart, [Beastheart.linkCaregiver, Beastheart.scaleCompanion, Beastheart.rollFerocity, Beastheart.getFerocityPath, Beastheart.getBondedActor, Beastheart.isCaregiver, Beastheart.isBeastHeart, Beastheart.isCompanion]);
  }

  /**
   * Hook handler for monitoring ferocity resource updates between
   * bonded beastheart and companion
   *
   * @param {ClientDocument} actor
   * @param {Object} update
   * @param {Object} options
   * @param {User} user
   *
   * @returns {Promise<undefined>}
   */
  static async #ferocityLink(actor, update, options, user) {

    const Util = game.modules.get('mcdm-core')?.api.Util;

    /* We will only handle updates that we issued that was NOT caused by a link update */
    if(user !== game.userId || !!(Beastheart.#BH.LINK_FLAG in options)) return;

    /* gather the two pieces of information needed for a successful linked update */
    const priValue = getProperty(update, Beastheart.getFerocityPath());
    const linkedActorId = actor.getFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG);


    /* if we have a legitimate value for the resource and a valid bonded actor,
     * run the update */
    if(priValue != undefined && !!linkedActorId){

      /* only need to update if they are actually different */
      const linkedActor = game.actors.get(linkedActorId);
      if(getProperty(actor,Beastheart.getFerocityPath()) != getProperty(linkedActor,Beastheart.getFerocityPath())){
        await linkedActor.update({[Beastheart.getFerocityPath()]: priValue}, {[Beastheart.#BH.LINK_FLAG]: actor.id});
      }
    }
  }

  /**
   * Presents a dialog from which the user can choose which owned actors
   * to bond together as a Caregiver/Companion pair
   *
   * @returns {Promise}
   */
  static async linkCaregiver() {

    const Util = game.modules.get('mcdm-core')?.api.Util;
    
    /* find all owned characters */
    const hearts = game.actors.filter( actor => actor.isOwner);
    const caregivers = hearts.reduce( (acc, actor) => acc += `<option value="${actor.id}">${actor.name}</option>`,'');

    /* find all owned Monstrous Companions */
    const comps = game.actors.filter( actor => Beastheart.isCompanion(actor));
    const companions = comps.reduce( (acc, actor) => acc += `<option value="${actor.id}">${actor.name}</option>`,'');

    const content = `
<form class="flexrow" style="margin-bottom:1em;">
  <div class="flexcol" style="align-items:center;">
    <label for="caregiver"><h3>Caregiver</h3></label>
    <select name="caregiver">${caregivers}</select>
  </div>
  <div class="flexcol" style="align-items:center;">
    <label for="companion"><h3>Companion</h3></label>
    <select name="companion">${companions}</select>
  </div>
</form>`;

    const callback = (html) => {
      let caregiver = html.find('[name="caregiver"]').val();
      let companion = html.find('[name="companion"]').val();
      return {caregiver, companion}
    };

    /* Prompt for actors to bond together */
    const choices = await Dialog.prompt({content, title: "Assign Caregiver to Companion", callback, rejectClose: false})

    if(choices) {

      const caregiver = game.actors.get(choices.caregiver);
      const companion = game.actors.get(choices.companion);

      /* if companion is already linked, grab that caregive and unlink */
      const prevCare = companion.getFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG);
      if (prevCare) await game.actors.get(prevCare)?.unsetFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG);

      /* if caregiver is already linked, grab that companion and unlink */
      const prevComp = caregiver.getFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG);
      if (prevComp) await game.actors.get(prevComp)?.unsetFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG);

      /* establish our new link pair */
      await caregiver.setFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG, choices.companion);
      await companion.setFlag(Util.DATA.NAME, Beastheart.#BH.LINK_FLAG, choices.caregiver);
      ui.notifications.info(`${companion.name} linked to ${caregiver.name}`);
      await Beastheart.scaleCompanion(companion);
    }

  }

  /**
   * For a given caregiver actor (or the user's currently assigned character), update
   * its companion's class level, HP, and spellDC to match the caregiver's current
   * progression.
   *
   * @param {Actor} companion
   *
   * @returns {Promise}
   */
  static async scaleCompanion(companion) {

    /* if an owned, linked companion is selected, use that, otherwise prompt*/
    let companionActor = !!companion ? companion : canvas.tokens.controlled[0]?.actor;
    let bondId = companionActor?.getFlag('mcdm-core', Beastheart.#BH.LINK_FLAG)
    if (!bondId) {
     /* prompt for companion to scale */   

      /* find all owned Monstrous Companions */
      const comps = game.actors.filter( actor => Beastheart.isCompanion(actor));
      const companions = comps.reduce( (acc, actor) => acc += `<option value="${actor.id}">${actor.name}</option>`,'');

      const content = `
<form class="flexrow" style="margin-bottom:1em;">
  <div class="flexcol" style="align-items:center;">
    <label for="companion"><h3>Companion</h3></label>
    <select name="companion">${companions}</select>
  </div>
</form>`;

      const callback = (html) => {
        let companion = html.find('[name="companion"]').val();
        return companion;
      };

      /* Prompt for actors to bond together */
      const selected = await Dialog.prompt({content, title: "Select Companion to Scale", callback, rejectClose: false})

      if(selected) {
        companionActor = game.actors.get(selected);
        bondId = companionActor?.getFlag('mcdm-core', Beastheart.#BH.LINK_FLAG)
      }
    }

    const caregiverActor = game.actors.get(bondId);

    if( !caregiverActor ) {
      ui.notifications?.warn(`Cannot identify caregiver actor for ${companionActor?.name}`);
      return;
    }

    //Perform needed updates

    // 1) Class level adjustment
    const careLevel = foundry.utils.getProperty(caregiverActor, 'system.details.level') ?? 1;

    const compClassItem = Beastheart.#getClass(companionActor, Beastheart.#BH.MC_CLASS);

    if(!compClassItem) {
      ui.notifications?.error('Selected Companion does not have a Monstrous Companion class item. Stopping updates.');
      return;
    }

    //Update the class item immediately in order to use the proper proficiency bonus later on
    await compClassItem.update({'system.levels': careLevel});

    // 2) Max HP Adjustment. Class item contains `@scale.moncom.hpbase` as the scalor
    const base = Number(companionActor.getRollData().scale.moncom.hpbase);
    if(isNaN(base)) {
      ui.notifications?.error('Could not derive HP scaling from "@scale.moncom.hpbase". Ensure this scale value is present and configured. Stopping updates.');
      return;
    }
    const newMax = base + base * careLevel;

    // 3) Spell DC Adjustment. At level 1 is 10+prof, at level 2+ its caregivers DC.
    //    All companions should be using Strength as default Spellcasting stat
    const caregiverDC = caregiverActor.system.attributes.spelldc;

    //get current spellcasting stat
    const spellstat = companionActor.system.attributes.spellcasting;
    if (spellstat.length !== 3) {
      ui.notifications?.warn('Companion does not have a defined spellcasting ability. Please select one in order to properly scale any saving throw DCs.')
    }

    const companionBaseDC = (companionActor.system.abilities[spellstat]?.mod ?? 0) + companionActor.system.attributes.prof + 8;
    const dcModification = careLevel > 1 ? caregiverDC - companionBaseDC : companionActor.system.attributes.prof + 10 - companionBaseDC;

    await companionActor.update({'system.attributes.hp.max': newMax, 'system.bonuses.spell.dc': `+ ${dcModification}`});

    ui.notifications.info(`${companionActor.name} scaled to level ${careLevel}`);

  }

  /**
   * Start of combat turn Ferocity helper. Checks bond state, rolls for increased ferocity based
   * on dialog user input, prompts for how to handle a Rampage check (if it occurs), and activates
   * the companion's Rampage Bonus or Furious Rampage Bonus depending on the caregiver's features.
   *
   * @param {Actor} [companionActor]
   * @param {string} [die='1d4'] Size of ferocity die to roll
   * @param {number} [hostileBonus=0] Prepopulate ferocity roll bonus which
   *   describes the number of enemies within 5 feet.
   *
   * @returns {Promise}
   */
  static async rollFerocity(companionActor = undefined, die = '1d4', hostileBonus = 0){
    
    let caregiverActor;

    /* if provided with a companion, use it, otherwise, derive from possessed */
    if(!companionActor) {
      if (!game.user.character) {
        ui.notifications.error(`No assigned character, or assigned character is not a caregiver.`);
        return;
      }

      caregiverActor = game.user.character;
    } else {
      caregiverActor = Beastheart.getBondedActor(companionActor)
    }

    companionActor = Beastheart.getBondedActor(caregiverActor)
    const feroPath = Beastheart.getFerocityPath();

    //find all owned Monstrous Companions
    const comps = game.actors.filter( actor => Beastheart.isCompanion(actor, true));

    const defaultCompName = companionActor?.name + " (Default)";

    const companions = comps.reduce( (acc, actor) => acc += `<option value="${caregiverActor.id}">${actor.name}</option>`, companionActor ? `<option value="${companionActor.id}">${defaultCompName}</option>` : '');

    let content = `
<form class="flexrow" style="margin-bottom:1em;">
  <div class="flexcol" style="align-items:center;">
    <label for="companion"><h3>Companion</h3></label>
    <select name="companion">${companions}</select>
  </div>
  <div class="flexcol" style="align-items:flex-end;">
    <label for="base"><h3>Base</h3></label>
    <h4 name="base" style="margin-top:auto;margin-bottom:auto;">${die} + </h4>
  </div>
  <div class="flexcol" style="align-items:center;">
    <label for="nearby"><h3>Hostiles</h3></label>
    <input type="number" name="nearby" placeholder=${hostileBonus}>
  </div>
</form>`;

    let callback = (html) => {
      const companion = html.find('[name="companion"]').val();
      const nearby = html.find('[name="nearby"]').val();
      return {companion, nearby: Number(nearby)};
    };

    //prompt for companion and number of nearby enemies
    let result = await Dialog.prompt({content, callback, title: 'Ferocity: Select Companion and Nearby Creatures', rejectClose: false, options:{width: '100%'}})

    console.log(result)

    if (result == undefined) return;

    const {companion, nearby} = result;

    const chosenCompanion = game.actors.get(companion);
    const caregiver = Beastheart.getBondedActor(chosenCompanion);
    if(!caregiver) {
      ui.notifications?.error(`Chosen companion "${chosenCompanion.name}" does not have a bonded caregiver!`)
      return;
    }
    const currentFerocity = getProperty(caregiver, feroPath);

    const feroRoll = await new Roll(`${currentFerocity ?? 0}[current] + @scale.beastheart.ferogain + ${die} + ${nearby}`).evaluate({async:true}, caregiver.getRollData() );
    const total = feroRoll.total;

    await feroRoll.toMessage({flavor: total >= 10 ? 'Ferocity Roll - Rampage Threat!' : 'Ferocity Roll', speaker: ChatMessage.getSpeaker({actor: chosenCompanion})});

    await chosenCompanion.update({[feroPath]: total});

    //Rampage check!
    if(total>=10){
      const DC = 5 + total;

      const rampageContent = `
<form class="flexrow" style="margin-bottom:1em;">
    <label for="action"><h3>Caregiver: ${caregiver.name}</h3></label>
    <select name="action">
      <option value="roll">Roll Animal Handling</option>
      <option value="pass">Force Pass</option>
      <option value="fail">Force Fail</option>
    </select>
</form>`;

      const rampageCallback = (html) => {
        const action = html.find('[name="action"]').val();
        return action
      };

      const rollChoice = await Dialog.prompt({content: rampageContent, callback: rampageCallback, rejectClose: false, title: `DC ${DC} Rampage Check`})
      let checkPass = false;
      switch(rollChoice) {
        case 'roll':
          const d20roll = await caregiver.rollSkill('ani');
          checkPass = d20roll.total >= DC;
          break;
        case 'pass':
          checkPass = true;
          break;
        case 'fail':
          checkPass = false;
          break;
      }

      if(checkPass) {
        await ChatMessage.create({
          content: `${caregiver.name} keeps ${chosenCompanion.name}'s ferocity under control.`,
          speaker: ChatMessage.getSpeaker({actor: chosenCompanion}),
          flavor: `DC ${DC} Rampage Check`
        });
      } else {
        await ChatMessage.create({
          content: `${caregiver.name} is unable to control ${chosenCompanion.name}'s ferocity as they enter a rampage!`,
          speaker: ChatMessage.getSpeaker({actor: companion}),
          flavor: `DC ${DC} Rampage Check`
        });

        /* attempt to enable the pre-placed Rampage AE */

        // Do we have furious rampage?
        const furious = caregiver.items.getName('Furious Rampage');
        const aeLabel = !!furious ? 'Furious' : 'Rampaging';
        // Try to find the AE on the actor and enable it
        const effect = chosenCompanion.effects.find( e => e.label == aeLabel );
        if(effect) {
          await effect.update({disabled: false})
        } else {
          ui.notifications?.warn(`Could not find expected AE "${aeLabel}" on "${chosenCompanion.name}" [${chosenCompanion.uuid}]`)
        }

      }
    }
  }
}

/*
  Initialize Plugin
*/
Beastheart.build();


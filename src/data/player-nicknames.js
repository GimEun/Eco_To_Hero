// 새 게임용 영어 핸들. 신화와 판타지 이름을 함께 사용한다.
// 각 후보는 영문 최대 9자이며, 접미사나 임의 철자 변형으로 수를 늘리지 않는다.
export const PLAYER_NICKNAME_GROUPS = [
  { id: 'deities', weight: 25, handles: `
    Nyx Eos Horus Anubis Freyja Vesta Erebus Zeus Hera Athena Apollo Artemis
    Ares Hermes Hestia Demeter Poseidon Hades Dionysus Hecate Selene Helios
    Cronus Rhea Gaia Uranus Pontus Oceanus Tethys Hyperion Theia Coeus Phoebe
    Iapetus Themis Mnemosyne Metis Leto Dione Nemesis Nike Iris Hebe Tyche
    Eris Harmonia Enyo Eileithya Pan Hypnos Thanatos Morpheus Phobos Deimos
    Eros Anteros Himeros Pothos Asclepius Hygieia Aether Hemera Ananke
    Janus Juno Jupiter Mars Mercury Minerva Neptune Pluto Ceres Diana
    Venus Vulcan Saturn Bellona Fortuna Victoria Somnus Terminus Pomona
    Flora Faunus Quirinus Portunus Consus Pales Carmenta Silvanus Aurora
    Odin Thor Loki Frigg Baldr Tyr Heimdall Bragi Idunn Njord Freyr Skadi
    Ullr Forseti Vidar Vali Hel Ran Aegir Eir Nanna Sif Gefjon Var Vor
    Syn Snotra Sol Mani Dagr Nott Nerthus Ymir Surtr Buri Bor Mimir Kvasir
    Osiris Isis Set Nephthys Thoth Ra Hathor Bastet Sekhmet Ptah Sobek
    Khonsu Nut Geb Shu Tefnut Amun Neith Maahes Wepwawet Anhur Khepri
    Atum Taweret Bes Seshat Maat Montu Satet Anuket Mut Hapi
    Inanna Ishtar Enki Enlil Anu Sin Utu Shamash  Marduk
    Nergal Ninurta Tiamat Apsu Dagon Baal Astarte Anat Resheph
    Amaterasu Tsukuyomi Susanoo Inari Raijin Fujin Izanagi Izanami Hachiman
    Benzaiten Ebisu Daikoku Shiva Vishnu Brahma Indra Agni Varuna Vayu
    Surya Chandra Yama Kali Durga Lakshmi Sarasvati Ganesha Hanuman
    Lugh Brigid Dagda Danu Morrigan Nuada Arawn Rhiannon Cerridwen
  `.trim().split(/\s+/) },
  { id: 'figures', weight: 15, handles: `
    Icarus Sigurd Cadmus Atalanta Circe Perseus Achilles Hector Ajax Odysseus
    Theseus Jason Medea Ariadne Phaedra Orpheus Eurydice Narcissus Echo
    Daedalus Aeneas Dido Turnus Camilla Evander Pallas Chiron Heracles
     Oedipus Antigone Ismene Electra Orestes Castor Pollux Helen
    Paris Andromeda  Danae Europa Io Semele Psyche Galatea
    Pygmalion Sisyphus Tantalus Pelops Midas Endymion Adonis Leander Hero
    Pentheus Actaeon Talos Typhon Medusa Stheno Euryale Pegasus Cerberus
    Fenrir Sleipnir Fafnir Regin Brynhild Gudrun Gunnar Volund Beowulf
    Grendel Hrothgar Siegfried Kriemhild  Hagen Dietrich
    Arthur Merlin Morgan Galahad Gawain Percival Lancelot Tristan Isolde
    Bedivere Kay Nimue Vivien Oberon Titania Puck Mab Prospero Ariel
    Caliban Gandalf Sauron Saruman Aragorn Legolas Gimli Elrond Galadriel
    Eowyn Arwen Faramir Boromir Frodo Samwise Bilbo Thorin Smaug Radagast
    Eragon Saphira Arya Brom Murtagh Oromis Glaedr Elric Drizzt Raistlin
    Cuchulain Deirdre Diarmuid Oisin Fionn Niamh Bran Taliesin Gilgamesh
    Enkidu Rostam Sohrab Arash Behram Aladdin Sinbad 
  `.trim().split(/\s+/) },
  { id: 'relics', weight: 10, handles: `
    Gungnir Mjolnir Aegis Harpe Gram Brisingr Excalibur Caliburn Durandal
    Joyeuse Curtana Almace Hautecler Balmung Nothung Hrunting Naegling
    Hrotti Ridill Mistilte Tyrfing Skofnung Dainsleif Laevatein Angurvad
    Gleipnir Draupnir   Gjallar  Kusanagi Totsuka
     Yasakani Yata Vajra Trishula Pinaka Sharanga Nandaka
     Kaumodaki Gandiva Pashupata Vel  Zulfiqar Shamshir
    Khopesh Kopis Xiphos Falcata Falchion Estoc Rapier Claymore Flamberge
    Halberd Glaive Partisan Ranseur Spetum Trident Longinus Gaebolg
    Fragarach Claimhsol Moralltac  Caladbolg  
    Hatteras Anduril Narsil Sting Glamdring Orcrist Angrist Gurthang
    Ringil Grond Aeglos Morgul Zarroc Aren Vrangr Ithildin Palantir
    Firebolt Frostfang  Soulreave Stormfang Nightfall Sunblade
  `.trim().split(/\s+/) },
  { id: 'feelings', weight: 20, handles: `
    Ardor Solace Fervor Rue Wistful Yearning Awe Bliss Glee Joy Sorrow
    Grief Dread Angst Angstful Ennui Elation Rapture Euphoria Ecstasy
    Delight Wonder Marvel Reverie Longing Pining Tender Fondness Affinity
    Amity Adore Devotion Passion Zeal Zest Verve Vigor Mettle Resolve
    Courage Valor Gallantry Daring Defiance Tenacity Grit Nerve Poise
    Composure Serenity Calm Tranquil Stillness Quietude Hush Lull Repose
    Ease Relief Comfort Content Gratitude Grace Mercy Empathy Kindness
    Warmth Cheer  Hope Faith Trust Belief Candor Sincere
    Earnest Fonder Pensive Brooding Wist Hiraeth Saudade Sehnsucht
    Nostalgia  Languor Listless Weary Sullen Somber Mourning
    Regret Remorse Rueful Guilt Shame Humble Modesty Chagrin Abash
    Bashful Shyness Coyness Reserve Timid Unease Unrest Disquiet Worry
    Anxiety Apprehend Alarm Fright Terror Panic Horror Revulsion Disgust
    Aversion Disdain Contempt Scorn Resent Envy Jealous Choler Ire Wrath
    Fury Vexation Chafe Chagrined Churlish Spite Malice Sulk Petulance
    Agony Anguish Torment Despair Bleak Forlorn Desolate Hollow Solitude
    Lonely Bereft Ache Heartache Heartfelt Tenderly Flutter Roused
    Startle Surprise Amazement Intrigue Curiosity Interest Eager Antsy
    Avid Thrill Exult Jubilant Gleeful Buoyant Lively Playful Serene
    Fearless Dauntless Stoic Patient Placid Unruffled Fierce Feral
  `.trim().split(/\s+/) },
  { id: 'objects', weight: 30, handles: `
    Spindle Inkwell Thimble Locket Whetstone Bobbin Awl Bodkin Shuttle
    Needle Pincush Palmguard  Shears Scissors Spool Skein Hank
    Distaff Loom Treadle Heddle Reed Weft Warp Twill Damask Muslin
    Calico Linen Felt Velvet Satin Taffeta Brocade Tulle Chintz Gauze
    Flannel Burlap Canvas Corduroy Ribbon Tassel Fringe Lace Braid Cord
    Twine Thread Filament Yarn Wick Tallow Candle Lantern Sconce Lamp
    Matchbox Tinder Flint Striker Bellows Brazier Hearth Trivet Poker
    Andiron Kettle Teapot Strainer Infuser Samovar Censer Chalice Goblet
    Tumbler Decanter Carafe Ewer Pitcher Beaker Flask Vial Ampoule Phial
    Cruet Funnel Siphon Pipette Dropper Mortar Pestle Crucible Retort
    Alembic Cuvette Palette Easel Stylus Quill Nib Blotter Parchment
    Vellum Papyrus Folio Quarto Codex Ledger Journal Almanac Gazette
    Bookmark Bookend Satchel Valise Trunk Coffer Casket Reliquary Keepsake
    Signet Cameo Brooch Clasp Buckle Latch Hasp Hinge Rivet Grommet
    Eyelet Ferrule Washer Gasket Cotter Dowel Peg Wedge Shim Spline
    Ratchet Socket Spanner Caliper Divider Compass Sextant Astrolabe
    Sundial Hourglass Pendulum Gnomon Orrery Gyroscope Plumbline Level
    Trowel Dibber Sickle Scythe Rake Mattock Auger Gimlet Chisel Gouge
    Adze Mallet Anvil Vise Pliers Forceps Tweezers Scalpel Lancet
    Suture  Splint Brace Salver Tray Ladle Skimmer Colander
    Sieve Grater Peeler Zester Cleaver Parer Masher Whisk Spatula
     Ramekin Tureen Saucer Crock Cloche Tagine Skillet Griddle
    Cauldron Wok Pot Mandolin Ocarina Kalimba Zither Dulcimer
    Lute Lyre Fiddle Bow Plectrum Rosin Tuningpeg Metronome Chime
    Rattle Castanet Tambour Drum Gong Cymbal Triangle Marimba Xylophone
    Rainstick Seaglass Pebble Pumice Shale Slate Chalk Graphite Charcoal
    Pastel Pigment Ochre Indigo Sepia Sienna Umber Vermilion Lacquer
    Resin Shellac Beeswax Camphor Sachet Pomander Potpourri Diffuser
    Doorknob Keyhole Keyring Padlock Keycap Lanyard Carabiner Pulley
    Sprocket Cogwheel Pinion Flywheel Spring Coil Spigot Nozzle Sprayer
    Throttle Manifold Bushing Ballast Keel Tiller Oar Rudder Buoy Anchor
    Bobber Sinker Tackle Net Creel Canteen Messkit Hammock Bedroll
  `.trim().split(/\s+/) },
];

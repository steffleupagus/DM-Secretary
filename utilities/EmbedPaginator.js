const { MessageEmbed } = require('discord.js');
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

const EMBED_MAX = 6000
const EMBED_FIELD_MAX = 1024
const EMBED_DESC_MAX = 2048
const EMBED_TITLE_MAX = 256
const EMBED_FIELD_COUNT_MAX = 25

class EmbedPaginator
{
	constructor(embed_options = {})
	{
        this._current_field_name = '';
        this._current_field_inline = false;
        this._current_field = [];
        this._field_count = 0;
        this._embed_count = 0;

        this._footer_url = null;
        this._footer_text = null;

		this._color = null;

        this._default_embed_options = embed_options;
        this._embeds = [new MessageEmbed(embed_options)];
		this._total_fields = 0;
		this._current_fields = 0;
	}	

	countEmbeds()
	{
		return this._embeds.length;
	}

	countCurrentFields()
	{
		return this._current_fields;
	}

	/// Adds a title to the embed. 
	/// Appears before any fields. Will throw if the current embed can't fit the value.
    setTitle(value)
	{
        if (value.length > EMBED_TITLE_MAX || value.length + this._embed_count > EMBED_MAX)
            throw "The current embed cannot fit this title.";
        this._embeds[this._embeds.length-1].title = value
        this._embed_count += value.length
	}

	setUrl(value)
	{
		if (value.length + this._embed_count > EMBED_MAX)
			throw "The current embed cannot fit this url.";
        this._embeds[this._embeds.length-1].url = value
        this._embed_count += value.length
	}

	setColor(value)
	{
		this._embeds[this._embeds.length-1].setColor(value);
	}
	
	/// Adds a description to the embed. 
	/// Appears before any fields. Will throw if the current embed can't fit the value.
    setDescription(value)
	{
        if (value.length > EMBED_DESC_MAX || value.length + this._embed_count > EMBED_MAX)
            throw "The current embed cannot fit this description.";

        this._embeds[this._embeds.length-1].description = value
        this._embed_count += value.length
	}

	setThumbnail(value)
	{
        if (value.length + this._embed_count > EMBED_MAX)
            throw "The current embed cannot fit this thumbnail URL.";
        this._embeds[this._embeds.length-1].setThumbnail(value);
        this._embed_count += value.length
	}

	setImage(value)
	{
        if (value.length + this._embed_count > EMBED_MAX)
            throw "The current embed cannot fit this image URL.";
        this._embeds[this._embeds.length-1].setImage(value);
        this._embed_count += value.length
	}


	canSafelyAddField(name, value)
	{
        if (value.length > EMBED_FIELD_MAX || 
			name.length > EMBED_TITLE_MAX)
			return false;
		return true;		
	}

	/// Add a new field to the help embed.
    addField(name='', value='', inline=false)
	{
        if (value.length > EMBED_FIELD_MAX || name.length > EMBED_TITLE_MAX)
		{
			console.log(name, "\n", value);
            throw "This value is too large to store in an embed field.";
		}

        if (this._current_field.length > 0)
            this.close_field()

		if (this.countCurrentFields() >= EMBED_FIELD_COUNT_MAX)
			this.close_embed()
			
		this._total_fields++;
		this._current_fields++;
        this._field_count += value.length + 1

        this._current_field_name = name
        this._current_field_inline = inline
        this._current_field.push(value)
	}

	/// Add a line of text to the last field in the embed.
    extendField(value, rolloverTitle="** **", inline=false)
	{
        if (value.length > EMBED_FIELD_MAX)
            throw "This value is too large to store in an embed field.";

        if (this._field_count + value.length + 1 > EMBED_FIELD_MAX)
		{
            this.close_field();
            this.addField(rolloverTitle, value, inline);  //create field with no title to look ~seamless
		}
        else
		{
            this._field_count += value.length + 1;
            this._current_field.push(value);
		}
	}

	/// Terminate the current field and write it to the last embed.
    close_field()
	{
        var value = this._current_field.join('\n');

        if (this._embed_count + value.length + this._current_field_name.length > EMBED_MAX)
            this.close_embed();

        this._embeds[this._embeds.length-1].addField(this._current_field_name, value,
													 this._current_field_inline);
        this._embed_count += value.length + this._current_field_name.length;

        this._current_field_name = '';
        this._current_field_inline = false;
        this._current_field = [];
        this._field_count = 0;
	}

	closeField()
	{
		this.close_field()
	}


	/// Sets the footer on the final embed.
    setFooter(value=null, icon_url=null)
	{
        this._footer_text = value	
        this._footer_url = icon_url
	}

	/// Write the footer to the last embed."""
    close_footer()
	{
        var current_count = this._embed_count;
        var kwargs = {}
        if (this._footer_url)
		{
            current_count += this._footer_url.length;
            kwargs['icon_url'] = this._footer_url;
		}
        if (this._footer_text)
		{
            current_count += this._footer_text.length;
            kwargs['text'] = this._footer_text;
		}
        if (current_count > EMBED_MAX)
            this.close_embed()
		if (this._footer_text)
        	this._embeds[this._embeds.length-1].setFooter(kwargs);		
	}

	//Terminate the current embed and create a new one.
    close_embed(repeatFooter=false)
	{
        this._embeds.push(new MessageEmbed(this._default_embed_options));
        this._embed_count = 0;
		this._current_fields = 0;
	}

	break_embed()
	{
		if (this._field_count)
			this.close_field();
		if (this._embed_count)
			this.close_embed();
	}

    length()
	{
		var total = 0;
		this._embeds.forEach(e => {
			total += e.length;
		});

        return total + this._embed_count;
	}

	/// Returns the rendered list of embeds.
    embeds()
	{
		if (this._field_count)
            this.close_field();
        this.close_footer();
        return this._embeds;
	}

	async send(channel, message=null, callback=null, completedCallback=null)
	{
		var sentMessages = [];
		await Utils.asyncArrayForEach(this.embeds(), async embed=>
		{
			let sentMsg = null;
			if (message)
			{
				sentMsg = await channel.send({content:message, embeds:[embed]})
									   .catch(console.error);
				message = null;
			}
			else
				sentMsg = await channel.send({embeds: [embed]}).catch(console.error);
			sentMessages.push(sentMsg)
			if (callback && sentMsg)
				callback(sentMsg);
		});
		return sentMessages;
	}

	async sendComplex(channel, data, callback=null, callbackArg=null)
	{
		await Utils.asyncArrayForEach(this.embeds(), async embed=>
		{
			data.embeds = [embed];
			var sentMsg = await channel.send(data).catch(console.error);
			if (callback && sentMsg)
			{
				if (callbackArg)
					callback(callbackArg, sentMsg);
				else
					callback(sentMsg);
			}
		});
	}
}

EmbedPaginator.prototype.toString = function EmbedPaginatorToString() 
{
	var output = "<EmbedPaginator\n";
		output+= `\t_current_field_name=${this._current_field_name}\n`
		output+= `\t_field_count=${this._field_count}\n`;
		output+= `\t_embed_count=${this._embed_count}\n`;
		output+= `\tTotal Embeds=${this._embeds.length}\n`;
		output+= `\tTotal Fields=${this._total_fields}\n`;

	for (let e=0; e<this._embed_count; ++e)
	{
		const embed = this._embeds[e];	

//		console.log(e, embed)
		if (!embed) continue;		
		output+= `\tEmbed ${e}: ${embed.fields.length} fields | ${embed.length} total length\n`
	}

	return output;
};


module.exports = EmbedPaginator;